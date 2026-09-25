import { describe, expect, it } from 'vitest';
import { SECCIONES as SECCIONES_GESTION } from '../../app/gestion/secciones';
import { SECCIONES as SECCIONES_INSTITUCIONAL } from '../../app/institucional/secciones';
import { SECCIONES as SECCIONES_CASOS } from '../../app/casos/secciones';
import { SUPERADMIN_LINKS } from '../../app/superadmin/navigation';

describe('Centro de Control del Superadmin', () => {
  it('incluye todas las rutas declaradas por Gestión, Institucional y Casos', () => {
    const indexed = new Set(SUPERADMIN_LINKS.map((item) => item.href));
    const expected = [
      ...SECCIONES_GESTION.map((item) => item.href),
      ...SECCIONES_INSTITUCIONAL.map((item) => item.href),
      ...SECCIONES_CASOS.map((item) => item.href),
    ];

    for (const href of expected) expect(indexed.has(href), `Falta ${href} en el Centro de Control`).toBe(true);
  });

  it('no repite rutas dentro del índice global', () => {
    const hrefs = SUPERADMIN_LINKS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
