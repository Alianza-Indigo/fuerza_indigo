import { describe, expect, it } from 'vitest';
import { can, effectiveGrantedPermissions, fieldMaskFor } from '@/platform/authz/policy';
import { ALL_PERMISSION_CODES, PERMISSIONS } from '@/platform/authz/permissions';
import { root } from '../../support/actors';

/**
 * El Superadmin raíz (docs/PERMISSIONS.md §5.1, PRD §4.4).
 *
 * Por decisión de la persona usuaria (ADR-0174, que revierte ADR-0026), la raíz
 * tiene **acceso total**: todos los permisos del catálogo, todos los
 * compartimentos, todas las entidades y territorios, y sin freno de asignación,
 * de motivo escrito ni de lectura masiva. Estas pruebas fijan ese acuerdo para
 * que el código no lo contradiga sin que nada lo advierta.
 */

describe('el actor raíz tiene todos los permisos del catálogo', () => {
  it('su concesión efectiva es el catálogo completo', () => {
    const concedidos = effectiveGrantedPermissions(root());
    expect(concedidos.size).toBe(ALL_PERMISSION_CODES.size);
    for (const permiso of PERMISSIONS) {
      expect(concedidos.has(permiso.code), `falta ${permiso.code}`).toBe(true);
    }
  });

  it('puede ejercer cualquier permiso del catálogo sobre cualquier recurso', () => {
    for (const permiso of PERMISSIONS) {
      expect(can(root(), permiso.code, { kind: 'Cualquiera' }).allowed, `denegó ${permiso.code}`).toBe(true);
    }
  });
});

describe('el actor raíz gobierna y administra todo', () => {
  // Antes estaban prohibidas: voto, resolución de afiliación, decisión
  // disciplinaria y otorgar/revocar roles. Ahora la raíz las puede.
  it.each([
    'voting.ballot.cast',
    'election.election.manage',
    'membership.application.resolve',
    'discipline.decision.issue',
    'assembly.quorum.declare',
    'access.role.assign',
    'access.role.revoke',
  ])('puede %s', (code) => {
    expect(can(root(), code, { kind: 'Cualquiera' }).allowed).toBe(true);
  });
});

describe('el actor raíz tiene todos los compartimentos', () => {
  it.each(['UNION', 'DISCIPLINARY', 'SOCIAL'] as const)('lee un recurso del compartimento %s', (compartimento) => {
    expect(can(root(), 'identity.person.read', { kind: 'Person', compartment: compartimento }).allowed).toBe(true);
  });
});

describe('el actor raíz lee datos personales en masa', () => {
  it('permite la lectura masiva con datos personales (salvaguarda retirada en ADR-0174)', () => {
    expect(
      can(root(), 'identity.person.read', { kind: 'Person', isBulk: true, containsPersonalData: true }).allowed,
    ).toBe(true);
  });
});

describe('el actor raíz no se frena por asignación ni por motivo', () => {
  it('un permiso que exige asignación viva no se le niega por no tener nombramiento', () => {
    const conAsignacion = PERMISSIONS.find((permiso) => permiso.needsAssignment);
    expect(conAsignacion, 'el catálogo no tiene ningún permiso con needsAssignment').toBeDefined();
    // Sin probe de asignación: a una persona se le negaría SIN_ASIGNACION; a la raíz no.
    expect(can(root(), conAsignacion!.code, { kind: 'Cualquiera' }).allowed).toBe(true);
  });

  it('un permiso que exige motivo no se le niega por no escribirlo', () => {
    const conMotivo = PERMISSIONS.find((permiso) => permiso.requiresReason);
    expect(conMotivo, 'el catálogo no tiene ningún permiso con requiresReason').toBeDefined();
    expect(can(root(), conMotivo!.code, { kind: 'Cualquiera' }).allowed).toBe(true);
  });
});

describe('máscara de campos', () => {
  it('al actor raíz se le entrega la persona completa, sin proyección', () => {
    expect(fieldMaskFor(root(), { kind: 'Person' })).toBeUndefined();
  });

  it('no se aplica máscara a recursos que no son personas', () => {
    expect(fieldMaskFor(root(), { kind: 'TerritorialUnit' })).toBeUndefined();
  });
});
