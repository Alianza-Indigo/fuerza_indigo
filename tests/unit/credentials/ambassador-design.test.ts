import { describe, expect, it } from 'vitest';

import { svgCredencialDeEmbajador } from '@/platform/credentials/ambassador-design';
import { matrizQr, trazoQr } from '@/platform/credentials/qr';

const DATOS = {
  displayName: 'María Fernanda Hernández López',
  code: 'FI-EMB-00017',
  territory: 'Chihuahua, Chihuahua',
  issuedAt: new Date('2026-09-29T12:00:00.000Z'),
  affiliationUrl: 'https://fuerza-indigo.example/embajadores/FI-EMB-00017',
};

describe('la credencial digital del Embajador Índigo', () => {
  it('es una tarjeta ID-1 con sus datos públicos', () => {
    const svg = svgCredencialDeEmbajador(DATOS);

    expect(svg).toContain('width="85.6mm"');
    expect(svg).toContain('height="54mm"');
    expect(svg).toContain('viewBox="0 0 856 540"');
    expect(svg).toContain(DATOS.displayName);
    expect(svg).toContain(DATOS.code);
    expect(svg).toContain(DATOS.territory);
    expect(svg).toContain('Alta 29.09.2026');
    expect(svg).toContain('AFILIADOR AUTORIZADO');
  });

  it('codifica en el QR el enlace personal de afiliación', () => {
    const svg = svgCredencialDeEmbajador(DATOS);
    const trazo = trazoQr(matrizQr(DATOS.affiliationUrl));

    expect(svg).toContain(trazo);
  });

  it('escapa el nombre y el territorio antes de incluirlos en el SVG', () => {
    const svg = svgCredencialDeEmbajador({
      ...DATOS,
      displayName: 'Ana <script>alert(1)</script> & Asociados',
      territory: 'Norte & Centro',
    });

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('Norte &amp; Centro');
  });

  it('no depende de variables CSS que desaparecen al descargarla', () => {
    expect(svgCredencialDeEmbajador(DATOS)).not.toContain('var(--');
  });
});
