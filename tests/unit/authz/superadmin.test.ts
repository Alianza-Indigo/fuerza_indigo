import { describe, expect, it } from 'vitest';
import { can, fieldMaskFor } from '@/platform/authz/policy';
import { PERMISSIONS, SUPERADMIN_GRANTED } from '@/platform/authz/permissions';
import { personWith, root } from '../../support/actors';

/**
 * El Superadmin raíz (docs/PERMISSIONS.md §8, PRD §4.4).
 *
 * El acuerdo institucional es que administra la plataforma y **no** gobierna el
 * sindicato. Estas pruebas son las que convierten ese acuerdo en algo
 * verificable: sin ellas, la frase queda en la documentación y el código puede
 * contradecirla sin que nada lo advierta.
 */

describe('lista cerrada de concesión', () => {
  /** Prueba negativa 12 de docs/PERMISSIONS.md §9. */
  it('todo permiso del catálogo que no figure en la lista le está denegado', () => {
    const noConcedidos = PERMISSIONS.filter((p) => !SUPERADMIN_GRANTED.has(p.code));

    // Que la lista sea cerrada solo importa si hay permisos fuera de ella.
    expect(noConcedidos.length).toBeGreaterThan(0);

    for (const permiso of noConcedidos) {
      const decision = can(root({ reason: 'motivo suficiente para la prueba' }), permiso.code, { kind: 'Cualquiera' });
      expect(decision.allowed, `el actor raíz obtuvo ${permiso.code}`).toBe(false);
      expect(decision.reason, `motivo equivocado en ${permiso.code}`).toBe('SIN_PERMISO');
    }
  });

  it('la lista no menciona permisos que no existen en el catálogo', () => {
    // Una entrada obsoleta daría la falsa impresión de que algo está concedido
    // o de que la lista se revisó cuando el catálogo cambió.
    const codigos = new Set(PERMISSIONS.map((p) => p.code));
    for (const code of SUPERADMIN_GRANTED) {
      expect(codigos.has(code), `${code} está en la lista de concesión pero no en el catálogo`).toBe(true);
    }
  });

  it('la lista contiene solo permisos de configuración y operación, ninguno de vida sindical', () => {
    // El criterio es explícito para que ampliarla exija justificarlo: si alguien
    // añade un permiso de otro módulo, esta prueba lo detiene.
    const modulosPermitidos = new Set([
      'system',
      'access',
      'institution',
      'territory',
      'files',
      'audit',
      'identity',
      'content',
    ]);
    const accionesSindicalesProhibidas = ['vote', 'membership', 'discipline', 'cian', 'ceni', 'assembly'];

    for (const code of SUPERADMIN_GRANTED) {
      const modulo = code.split('.')[0] ?? '';
      expect(modulosPermitidos.has(modulo), `${code} pertenece a un módulo no previsto`).toBe(true);
      for (const prohibida of accionesSindicalesProhibidas) {
        expect(code.includes(prohibida), `${code} es una acción de vida sindical`).toBe(false);
      }
    }
  });

  it('del CMS solo recibe el encaminamiento, nunca el contenido', () => {
    // Admitir el módulo `content` en bloque abriría la puerta a que un permiso
    // editorial entrara sin que nada lo advirtiera. Un borrador de comunicado
    // sobre un conflicto laboral es deliberación interna del sindicato.
    const delCms = [...SUPERADMIN_GRANTED].filter((code) => code.startsWith('content.'));
    expect(delCms).toEqual(['content.redirect.manage']);
  });
});

describe('prueba negativa 9 · el actor raíz no gobierna el sindicato', () => {
  // Los permisos de voto, admisión y certificación CENI se declaran en fases
  // posteriores. Lo que aquí se fija —y lo que hará que sigan denegados cuando
  // existan— es que ninguno se agregue a la lista de concesión.
  const acciones = ['vote.ballot.cast', 'membership.application.resolve', 'ceni.certificate.issue'];

  it.each(acciones)('%s no figura en la lista de concesión', (code) => {
    expect(SUPERADMIN_GRANTED.has(code)).toBe(false);
  });

  it('otorgar y revocar roles tampoco le corresponde: nombrar es un acto institucional', () => {
    expect(SUPERADMIN_GRANTED.has('access.role.assign')).toBe(false);
    expect(SUPERADMIN_GRANTED.has('access.role.revoke')).toBe(false);
    expect(can(root({ reason: 'motivo suficiente' }), 'access.role.assign', { kind: 'RoleAssignment' }).reason).toBe(
      'SIN_PERMISO',
    );
  });
});

describe('prueba negativa 10 · el actor raíz no tiene compartimentos', () => {
  it.each(['CLINICAL', 'DISCIPLINARY', 'SOCIAL'] as const)(
    'no lee un recurso del compartimento %s ni con un permiso que sí posee',
    (compartimento) => {
      const decision = can(
        root({ reason: 'motivo suficiente' }),
        'identity.person.read',
        { kind: 'Person', compartment: compartimento },
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('COMPARTIMENTO_AJENO');
    },
  );

  it('la denegación ocurre aunque el permiso esté concedido y el recurso no tenga otra restricción', () => {
    // Se comprueba el contraste: el mismo permiso sobre el mismo recurso sin
    // compartimento sí procede. Así queda claro que lo que deniega es el
    // compartimento y no otra cosa.
    expect(can(root(), 'identity.person.read', { kind: 'Person' }).allowed).toBe(true);
  });
});

describe('prueba negativa 11 · el actor raíz no lee datos personales en masa', () => {
  it('deniega la lectura masiva con datos personales', () => {
    const decision = can(root(), 'identity.person.read', {
      kind: 'Person',
      isBulk: true,
      containsPersonalData: true,
    });
    expect(decision.reason).toBe('LECTURA_MASIVA_PROHIBIDA');
  });

  it('permite el listado administrativo que no expone datos personales', () => {
    // Es la consulta que alimenta la pantalla de cuentas y roles: identifica a
    // la persona y enmascara el correo, sin contacto ni domicilio.
    expect(can(root(), 'identity.person.read', { kind: 'Person', isBulk: true, containsPersonalData: false }).allowed).toBe(true);
  });

  it('la restricción es del actor raíz, no de la operación', () => {
    const humano = personWith(['identity.person.read']);
    expect(can(humano, 'identity.person.read', { kind: 'Person', isBulk: true, containsPersonalData: true }).allowed).toBe(true);
  });

  it('la salvaguarda se evalúa después de las siete comprobaciones, no antes', () => {
    // Si se evaluara primero, una lectura masiva sin permiso se denegaría por
    // «lectura masiva» y ocultaría en la bitácora que además faltaba el permiso.
    const decision = can(root(), 'identity.person.update', {
      kind: 'Person',
      isBulk: true,
      containsPersonalData: true,
    });
    expect(decision.reason).toBe('SIN_PERMISO');
  });
});

describe('máscara de campos', () => {
  it('al actor raíz se le entrega la proyección mínima de una persona', () => {
    const mascara = fieldMaskFor(root(), { kind: 'Person' });
    expect(mascara).toBeDefined();
    expect(mascara).not.toContain('primaryEmail');
    expect(mascara).not.toContain('birthDate');
    expect(mascara).not.toContain('primaryPhone');
    expect(mascara).toContain('givenName');
  });

  it('quien tiene el permiso de datos sensibles recibe el registro completo', () => {
    const actor = personWith(['identity.person.read', 'identity.person.read_sensitive']);
    expect(fieldMaskFor(actor, { kind: 'Person' })).toBeUndefined();
  });

  it('quien no lo tiene recibe la proyección mínima aunque sea persona', () => {
    const actor = personWith(['identity.person.read']);
    expect(fieldMaskFor(actor, { kind: 'Person' })).toBeDefined();
  });

  it('no se aplica máscara a recursos que no son personas', () => {
    expect(fieldMaskFor(root(), { kind: 'TerritorialUnit' })).toBeUndefined();
  });
});
