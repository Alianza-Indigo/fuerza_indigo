import { describe, expect, it } from 'vitest';
import { can, effectiveGrantedPermissions, isCurrentlyEffective } from '@/platform/authz/policy';
import { assignment, ENTIDAD_POR_OMISION, job, person, personWith, root } from '../../support/actors';

/**
 * Motor de decisión (docs/PERMISSIONS.md §5.1).
 *
 * El orden de las siete comprobaciones es parte del contrato: cada bloque de
 * abajo fija una de ellas y comprueba que la denegación llega con el motivo que
 * corresponde y no con otro. Un motivo equivocado no es cosmético: es lo que
 * lee quien investiga un incidente en la bitácora de seguridad.
 */

describe('can · comprobación 1 · origen de los permisos', () => {
  it('deniega cuando el permiso no está en ninguna concesión vigente', () => {
    const actor = personWith(['identity.person.read']);
    expect(can(actor, 'identity.person.update', { kind: 'Person' })).toEqual({
      allowed: false,
      reason: 'SIN_PERMISO',
    });
  });

  it('concede cuando el permiso sí está', () => {
    const actor = personWith(['territory.unit.read']);
    expect(can(actor, 'territory.unit.read', { kind: 'TerritorialUnit' }).allowed).toBe(true);
  });

  it('rechaza un permiso que no existe en el catálogo, en vez de denegarlo en silencio', () => {
    // Denegar un permiso inexistente ocultaría una errata: la llamada quedaría
    // para siempre en falso sin que nadie se enterara.
    expect(() => can(personWith([]), 'inventado.recurso.accion', { kind: 'Cosa' })).toThrow(
      /Permiso desconocido/,
    );
  });
});

describe('can · comprobación 1 · vigencia del nombramiento', () => {
  const ahora = new Date('2026-06-15T12:00:00Z');

  it('un nombramiento que aún no comienza no otorga nada', () => {
    const actor = person({
      roles: [
        assignment({
          permissions: new Set(['territory.unit.read']),
          startsAt: new Date('2026-07-01T00:00:00Z'),
        }),
      ],
    });
    expect(can(actor, 'territory.unit.read', { kind: 'TerritorialUnit' }, {}, ahora).reason).toBe('SIN_PERMISO');
  });

  /** Prueba negativa 5 de docs/PERMISSIONS.md §9, en su forma de nombramiento. */
  it('un nombramiento vencido deja de otorgar sin que nadie intervenga', () => {
    const vencido = assignment({
      permissions: new Set(['territory.unit.read']),
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-06-01T00:00:00Z'),
    });
    const actor = person({ roles: [vencido] });

    expect(can(actor, 'territory.unit.read', { kind: 'TerritorialUnit' }, {}, new Date('2026-05-31T00:00:00Z')).allowed).toBe(true);
    expect(can(actor, 'territory.unit.read', { kind: 'TerritorialUnit' }, {}, ahora).reason).toBe('SIN_PERMISO');
  });

  it('el instante exacto del vencimiento ya no otorga', () => {
    const limite = new Date('2026-06-01T00:00:00Z');
    const asignacion = assignment({
      permissions: new Set(['territory.unit.read']),
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: limite,
    });
    expect(isCurrentlyEffective(asignacion, new Date(limite.getTime() - 1))).toBe(true);
    expect(isCurrentlyEffective(asignacion, limite)).toBe(false);
  });
});

describe('can · comprobación 2 · entidad jurídica', () => {
  it('un nombramiento acotado a una entidad no alcanza a la otra', () => {
    const actor = person({
      roles: [assignment({ permissions: new Set(['institution.legal_entity.read']), legalEntityId: 'entidad-fuerza' })],
    });

    expect(can(actor, 'institution.legal_entity.read', { kind: 'LegalEntity', legalEntityId: 'entidad-fuerza' }).allowed).toBe(true);
    expect(can(actor, 'institution.legal_entity.read', { kind: 'LegalEntity', legalEntityId: 'entidad-alianza' }).reason).toBe(
      'FUERA_DE_ENTIDAD',
    );
  });

  it('un recurso sin entidad no queda bloqueado por la comprobación de entidad', () => {
    const actor = person({
      roles: [assignment({ permissions: new Set(['institution.legal_entity.read']), legalEntityId: 'entidad-fuerza' })],
    });
    expect(can(actor, 'institution.legal_entity.read', { kind: 'LegalEntity' }).allowed).toBe(true);
  });
});

describe('can · comprobación 2 · un nombramiento SIN entidad no alcanza ninguna', () => {
  // El defecto `D-F1-012`. El motor convertía la ausencia de entidad en «todas»,
  // de modo que un nombramiento descuidado cruzaba las dos personas morales del
  // ecosistema. La documentación decía justo lo contrario desde el principio, y
  // ninguna prueba lo comprobaba porque las fixtures traían `null` por omisión.
  const sinEntidad = person({
    roles: [assignment({ permissions: new Set(['institution.legal_entity.read']), legalEntityId: null })],
  });

  it('no alcanza la entidad del sindicato', () => {
    const decision = can(sinEntidad, 'institution.legal_entity.read', {
      kind: 'LegalEntity',
      legalEntityId: 'entidad-fuerza',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('FUERA_DE_ENTIDAD');
  });

  it('tampoco alcanza la de la asociación civil', () => {
    expect(
      can(sinEntidad, 'institution.legal_entity.read', { kind: 'LegalEntity', legalEntityId: 'entidad-alianza' })
        .reason,
    ).toBe('FUERA_DE_ENTIDAD');
  });

  it('el mismo permiso con entidad sí alcanza la suya: lo que deniega es la ausencia', () => {
    const conEntidad = personWith(['institution.legal_entity.read']);
    expect(
      can(conEntidad, 'institution.legal_entity.read', { kind: 'LegalEntity', legalEntityId: ENTIDAD_POR_OMISION })
        .allowed,
    ).toBe(true);
  });

  it('sigue alcanzando los recursos que no pertenecen a ninguna entidad', () => {
    // El catálogo de permisos, la salud del sistema o el árbol territorial no
    // son de una entidad concreta. Denegarlos sería pasarse de largo.
    expect(can(sinEntidad, 'institution.legal_entity.read', { kind: 'LegalEntity' }).allowed).toBe(true);
  });

  it('varios nombramientos suman sus entidades, no las anulan', () => {
    const dosCargos = person({
      roles: [
        assignment({ permissions: new Set(['identity.person.read']), legalEntityId: 'entidad-fuerza' }),
        assignment({
          assignmentId: 'a2',
          permissions: new Set(['identity.person.read']),
          legalEntityId: 'entidad-alianza',
        }),
      ],
    });
    expect(can(dosCargos, 'identity.person.read', { kind: 'Person', legalEntityId: 'entidad-fuerza' }).allowed).toBe(true);
    expect(can(dosCargos, 'identity.person.read', { kind: 'Person', legalEntityId: 'entidad-alianza' }).allowed).toBe(true);
    expect(can(dosCargos, 'identity.person.read', { kind: 'Person', legalEntityId: 'entidad-tercera' }).reason).toBe(
      'FUERA_DE_ENTIDAD',
    );
  });
});

describe('can · el alcance total existe, pero se declara', () => {
  it('el actor raíz sí alcanza todas las entidades, por su rama explícita', () => {
    // Su función es administrar la plataforma entera. La diferencia con el caso
    // anterior es que aquí el alcance total está escrito, no es el efecto
    // secundario de un campo vacío.
    expect(can(root(), 'audit.audit.read', { kind: 'AuditEvent', legalEntityId: 'entidad-fuerza' }).allowed).toBe(true);
    expect(can(root(), 'audit.audit.read', { kind: 'AuditEvent', legalEntityId: 'entidad-alianza' }).allowed).toBe(true);
  });

  it('un trabajo programado también, y por la misma razón', () => {
    expect(
      can(job('role-expiry'), 'access.role.revoke', { kind: 'RoleAssignment', legalEntityId: 'entidad-alianza' })
        .allowed,
    ).toBe(true);
  });
});

describe('can · comprobación 3 · territorio', () => {
  /** Prueba negativa 3 de docs/PERMISSIONS.md §9. */
  it('un delegado no alcanza el territorio de otra delegación', () => {
    const actor = person({
      roles: [
        assignment({
          permissions: new Set(['identity.person.read']),
          territories: [{ territorialUnitId: 'jal', path: 'mx/jal', includesDescendants: true }],
        }),
      ],
    });

    expect(can(actor, 'identity.person.read', { kind: 'Person', territorialPath: 'mx/jal' }).allowed).toBe(true);
    expect(can(actor, 'identity.person.read', { kind: 'Person', territorialPath: 'mx/jal/guadalajara' }).allowed).toBe(true);
    expect(can(actor, 'identity.person.read', { kind: 'Person', territorialPath: 'mx/nay' }).reason).toBe('FUERA_DE_TERRITORIO');
  });

  it('sin descendientes, el alcance es la unidad exacta y nada por debajo', () => {
    const actor = person({
      roles: [
        assignment({
          permissions: new Set(['identity.person.read']),
          territories: [{ territorialUnitId: 'jal', path: 'mx/jal', includesDescendants: false }],
        }),
      ],
    });
    expect(can(actor, 'identity.person.read', { kind: 'Person', territorialPath: 'mx/jal' }).allowed).toBe(true);
    expect(can(actor, 'identity.person.read', { kind: 'Person', territorialPath: 'mx/jal/guadalajara' }).reason).toBe(
      'FUERA_DE_TERRITORIO',
    );
  });

  it('un prefijo que no termina en separador no cuenta como descendiente', () => {
    // «mx/jalisco» empieza por «mx/jal» como cadena, pero no está debajo de esa
    // unidad. Comparar prefijos sin exigir el separador confundiría dos
    // territorios distintos.
    const actor = person({
      roles: [
        assignment({
          permissions: new Set(['identity.person.read']),
          territories: [{ territorialUnitId: 'jal', path: 'mx/jal', includesDescendants: true }],
        }),
      ],
    });
    expect(can(actor, 'identity.person.read', { kind: 'Person', territorialPath: 'mx/jalisco' }).reason).toBe(
      'FUERA_DE_TERRITORIO',
    );
  });
});

describe('can · comprobación 3 bis · organización', () => {
  /** Prueba negativa 6 de docs/PERMISSIONS.md §9, en su forma de motor. */
  it('un usuario de organización no alcanza el expediente de otra organización', () => {
    const actor = person({
      roles: [assignment({ permissions: new Set(['files.file.download']), organizationId: 'org-a' })],
    });
    expect(can(actor, 'files.file.download', { kind: 'FileObject', organizationId: 'org-a' }).allowed).toBe(true);
    expect(can(actor, 'files.file.download', { kind: 'FileObject', organizationId: 'org-b' }).reason).toBe('FUERA_DE_ENTIDAD');
  });
});

describe('can · comprobación 4 · asignación viva sobre el expediente', () => {
  it('deniega cuando el permiso la exige y no la hay', () => {
    const actor = personWith(['files.file.download_sensitive'], {
      reason: 'revisión del expediente por solicitud de la persona',
      compartments: new Set(),
    });
    expect(can(actor, 'files.file.download_sensitive', { kind: 'FileObject' }).reason).toBe('SIN_ASIGNACION');
  });

  it('concede cuando la sonda confirma la asignación', () => {
    const actor = personWith(['files.file.download_sensitive'], {
      reason: 'revisión del expediente por solicitud de la persona',
    });
    const decision = can(
      actor,
      'files.file.download_sensitive',
      { kind: 'FileObject' },
      { hasLiveAssignment: () => true },
    );
    expect(decision.allowed).toBe(true);
  });

  it('sin sonda, un permiso que exige asignación se deniega en vez de concederse', () => {
    // Que el llamador olvide pasar la sonda no puede traducirse en un permiso
    // concedido: el valor por omisión es la denegación.
    const actor = personWith(['files.file.download_sensitive'], { reason: 'motivo suficiente' });
    expect(can(actor, 'files.file.download_sensitive', { kind: 'FileObject' }, {}).reason).toBe('SIN_ASIGNACION');
  });
});

describe('can · comprobación 5 · consentimiento', () => {
  /** Prueba negativa 7 de docs/PERMISSIONS.md §9, en su forma de motor. */
  it('deniega cuando el propósito exige consentimiento y no lo hay', () => {
    const actor = personWith(['consent.read']);
    const decision = can(
      actor,
      'consent.read',
      { kind: 'Consent' },
      { needsConsent: () => true, hasValidConsent: () => false },
    );
    expect(decision.reason).toBe('CONSENTIMIENTO_REQUERIDO');
  });

  it('concede cuando el consentimiento está vigente', () => {
    const actor = personWith(['consent.read']);
    const decision = can(
      actor,
      'consent.read',
      { kind: 'Consent' },
      { needsConsent: () => true, hasValidConsent: () => true },
    );
    expect(decision.allowed).toBe(true);
  });
});

describe('can · comprobación 6 · compartimento', () => {
  /** Prueba negativa 4 de docs/PERMISSIONS.md §9, en su forma de motor. */
  it('un rol sindical no lee un recurso de compartimento clínico', () => {
    const actor = personWith(['files.file.download'], { compartments: new Set() });
    expect(can(actor, 'files.file.download', { kind: 'FileObject', compartment: 'CLINICAL' }).reason).toBe(
      'COMPARTIMENTO_AJENO',
    );
  });

  it('concede a quien tiene el compartimento', () => {
    const actor = personWith(['files.file.download'], { compartments: new Set(['CLINICAL']) });
    expect(can(actor, 'files.file.download', { kind: 'FileObject', compartment: 'CLINICAL' }).allowed).toBe(true);
  });

  it('el compartimento del recurso prevalece sobre el del permiso', () => {
    // Un permiso genérico usado sobre un recurso compartimentado no se cuela
    // por ser genérico.
    const actor = personWith(['files.file.download'], { compartments: new Set(['DISCIPLINARY']) });
    expect(can(actor, 'files.file.download', { kind: 'FileObject', compartment: 'CLINICAL' }).reason).toBe(
      'COMPARTIMENTO_AJENO',
    );
    expect(can(actor, 'files.file.download', { kind: 'FileObject', compartment: 'DISCIPLINARY' }).allowed).toBe(true);
  });
});

describe('can · comprobación 7 · motivo escrito', () => {
  it('deniega un permiso que exige motivo cuando no lo hay', () => {
    const actor = personWith(['identity.person.merge']);
    expect(can(actor, 'identity.person.merge', { kind: 'Person' }).reason).toBe('MOTIVO_REQUERIDO');
  });

  it('un motivo en blanco no cuenta como motivo', () => {
    const actor = personWith(['identity.person.merge'], { reason: '    ' });
    expect(can(actor, 'identity.person.merge', { kind: 'Person' }).reason).toBe('MOTIVO_REQUERIDO');
  });

  it('concede con motivo escrito', () => {
    const actor = personWith(['identity.person.merge'], { reason: 'duplicidad reportada por la propia persona' });
    expect(can(actor, 'identity.person.merge', { kind: 'Person' }).allowed).toBe(true);
  });
});

describe('can · trabajos programados', () => {
  it('un trabajo solo puede lo que su tipo declara', () => {
    expect(can(job('role-expiry'), 'access.role.revoke', { kind: 'RoleAssignment' }).allowed).toBe(true);
    expect(can(job('role-expiry'), 'files.file.delete', { kind: 'FileObject' }).reason).toBe('SIN_PERMISO');
  });

  it('un tipo de trabajo desconocido no obtiene nada por el hecho de ser «el sistema»', () => {
    expect(can(job('inventado'), 'system.health.read', { kind: 'System' }).reason).toBe('SIN_PERMISO');
  });

  it('el trabajo de despacho no necesita ni obtiene permiso alguno', () => {
    expect(can(job('dispatch'), 'system.health.read', { kind: 'System' }).reason).toBe('SIN_PERMISO');
  });
});

describe('can · el actor público', () => {
  it('no obtiene nada', () => {
    const publico = person({ actorId: '', userId: null, personId: null, sessionId: null, roles: [] });
    expect(can(publico, 'identity.person.read', { kind: 'Person' }).reason).toBe('SIN_PERMISO');
  });
});

describe('effectiveGrantedPermissions', () => {
  it('para una persona, es la unión de sus nombramientos vigentes', () => {
    const actor = person({
      roles: [
        assignment({ permissions: new Set(['a.b.c']) }),
        assignment({ assignmentId: 'a2', permissions: new Set(['d.e.f']) }),
        assignment({
          assignmentId: 'a3',
          permissions: new Set(['g.h.i']),
          endsAt: new Date(Date.now() - 1000),
        }),
      ],
    });
    expect([...effectiveGrantedPermissions(actor)].sort()).toEqual(['a.b.c', 'd.e.f']);
  });

  it('para el actor raíz, es exactamente su lista cerrada', () => {
    expect(effectiveGrantedPermissions(root()).has('system.health.read')).toBe(true);
    expect(effectiveGrantedPermissions(root()).has('access.role.assign')).toBe(false);
  });
});
