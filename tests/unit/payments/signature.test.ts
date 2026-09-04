import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOLERANCE_SECONDS,
  signStripePayload,
  verifyStripeSignature,
} from '@/platform/payments/signature';

/**
 * Verificación de la firma de un webhook (PRD §11.4, F3-QA-002).
 *
 * Es la comprobación que separa un cobro real de uno inventado por cualquiera
 * que conozca la dirección del webhook. Por eso se prueba con cargas
 * construidas a mano y no con las de la biblioteca del proveedor.
 */

const SECRETO = 'whsec_de_prueba_para_fuerza_indigo';
const OTRO_SECRETO = 'whsec_de_prueba_para_alianza_indigo';
const CUERPO = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
const AHORA = new Date('2026-09-04T12:00:00.000Z');

describe('firma válida', () => {
  it('acepta la que se produjo con el mismo secreto y el mismo cuerpo', () => {
    const header = signStripePayload({ rawBody: CUERPO, secret: SECRETO, now: AHORA });
    expect(verifyStripeSignature({ rawBody: CUERPO, header, secret: SECRETO, now: AHORA })).toEqual({ valid: true });
  });

  it('acepta cuando hay varias firmas y una coincide, como en una rotación de secreto', () => {
    const marca = Math.floor(AHORA.getTime() / 1000);
    const buena = createHmac('sha256', SECRETO).update(`${marca}.${CUERPO}`).digest('hex');
    const header = `t=${marca},v1=0000000000000000000000000000000000000000000000000000000000000000,v1=${buena}`;

    expect(verifyStripeSignature({ rawBody: CUERPO, header, secret: SECRETO, now: AHORA })).toEqual({ valid: true });
  });
});

describe('firma inválida', () => {
  it('rechaza la firmada con el secreto de la otra cuenta', () => {
    // Es el caso de «cuenta cruzada»: un evento legítimo de Alianza Índigo
    // llegando a la dirección de Fuerza Índigo. La firma no coincide, y por eso
    // no se procesa contra la entidad equivocada.
    const header = signStripePayload({ rawBody: CUERPO, secret: OTRO_SECRETO, now: AHORA });
    expect(verifyStripeSignature({ rawBody: CUERPO, header, secret: SECRETO, now: AHORA })).toEqual({
      valid: false,
      reason: 'FIRMA_NO_COINCIDE',
    });
  });

  it('rechaza cuando el cuerpo cambió aunque sea un byte', () => {
    const header = signStripePayload({ rawBody: CUERPO, secret: SECRETO, now: AHORA });
    const alterado = CUERPO.replace('evt_1', 'evt_2');

    expect(verifyStripeSignature({ rawBody: alterado, header, secret: SECRETO, now: AHORA })).toEqual({
      valid: false,
      reason: 'FIRMA_NO_COINCIDE',
    });
  });

  it('rechaza un cuerpo reserializado, aunque diga lo mismo', () => {
    // Es la trampa clásica: leer el JSON, volver a serializarlo y firmar sobre
    // eso. Los espacios y el orden cambian, y la firma deja de coincidir. Por
    // eso la ruta tiene que leer el cuerpo crudo.
    const header = signStripePayload({ rawBody: CUERPO, secret: SECRETO, now: AHORA });
    const reserializado = JSON.stringify(JSON.parse(CUERPO), null, 2);

    expect(verifyStripeSignature({ rawBody: reserializado, header, secret: SECRETO, now: AHORA }).valid).toBe(false);
  });

  it('rechaza una marca de tiempo vieja: no se puede repetir una petición de ayer', () => {
    const viejo = new Date(AHORA.getTime() - (DEFAULT_TOLERANCE_SECONDS + 1) * 1000);
    const header = signStripePayload({ rawBody: CUERPO, secret: SECRETO, now: viejo });

    expect(verifyStripeSignature({ rawBody: CUERPO, header, secret: SECRETO, now: AHORA })).toEqual({
      valid: false,
      reason: 'MARCA_DE_TIEMPO_FUERA_DE_TOLERANCIA',
    });
  });

  it('rechaza una marca del futuro con el mismo criterio', () => {
    const futuro = new Date(AHORA.getTime() + (DEFAULT_TOLERANCE_SECONDS + 1) * 1000);
    const header = signStripePayload({ rawBody: CUERPO, secret: SECRETO, now: futuro });

    expect(verifyStripeSignature({ rawBody: CUERPO, header, secret: SECRETO, now: AHORA }).valid).toBe(false);
  });

  it('acepta justo en el borde de la tolerancia', () => {
    const borde = new Date(AHORA.getTime() - DEFAULT_TOLERANCE_SECONDS * 1000);
    const header = signStripePayload({ rawBody: CUERPO, secret: SECRETO, now: borde });

    expect(verifyStripeSignature({ rawBody: CUERPO, header, secret: SECRETO, now: AHORA }).valid).toBe(true);
  });

  it.each([
    ['ausente', null, 'ENCABEZADO_AUSENTE'],
    ['vacío', '', 'ENCABEZADO_AUSENTE'],
    ['sin marca de tiempo', 'v1=abc', 'ENCABEZADO_MALFORMADO'],
    ['sin firma', 't=1757000000', 'ENCABEZADO_MALFORMADO'],
    ['basura', 'no-es-un-encabezado', 'ENCABEZADO_MALFORMADO'],
    ['con marca no numérica', 't=ayer,v1=abc', 'ENCABEZADO_MALFORMADO'],
  ])('rechaza un encabezado %s', (_caso, header, motivo) => {
    expect(verifyStripeSignature({ rawBody: CUERPO, header, secret: SECRETO, now: AHORA })).toEqual({
      valid: false,
      reason: motivo,
    });
  });

  it('rechaza si el secreto no está configurado, en vez de dar por buena la firma', () => {
    const header = signStripePayload({ rawBody: CUERPO, secret: SECRETO, now: AHORA });

    // Sin secreto no se puede verificar nada. Lo peligroso sería tratar «no
    // puedo comprobarlo» como «está bien»: una instalación a medio configurar
    // aceptaría cualquier cobro inventado.
    expect(verifyStripeSignature({ rawBody: CUERPO, header, secret: '', now: AHORA })).toEqual({
      valid: false,
      reason: 'SECRETO_NO_CONFIGURADO',
    });
  });

  it('no se deja engañar por una firma de otra longitud', () => {
    const marca = Math.floor(AHORA.getTime() / 1000);
    expect(
      verifyStripeSignature({ rawBody: CUERPO, header: `t=${marca},v1=abc`, secret: SECRETO, now: AHORA }).valid,
    ).toBe(false);
  });
});

describe('el orden y el ruido del encabezado no importan', () => {
  it('acepta la firma antes que la marca de tiempo', () => {
    const marca = Math.floor(AHORA.getTime() / 1000);
    const firma = createHmac('sha256', SECRETO).update(`${marca}.${CUERPO}`).digest('hex');

    expect(
      verifyStripeSignature({ rawBody: CUERPO, header: `v1=${firma},t=${marca}`, secret: SECRETO, now: AHORA }).valid,
    ).toBe(true);
  });

  it('ignora los esquemas que no conoce, como el v0 de las firmas de Connect', () => {
    const marca = Math.floor(AHORA.getTime() / 1000);
    const firma = createHmac('sha256', SECRETO).update(`${marca}.${CUERPO}`).digest('hex');

    expect(
      verifyStripeSignature({
        rawBody: CUERPO,
        header: `t=${marca},v0=loquesea,v1=${firma}`,
        secret: SECRETO,
        now: AHORA,
      }).valid,
    ).toBe(true);
  });
});
