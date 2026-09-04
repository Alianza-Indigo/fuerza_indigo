import type { RoleCode, ScopeKind } from '../../../src/generated/prisma/enums';

/**
 * Los 19 roles base del PRD §4.2, con el conjunto de permisos que cada uno
 * recibe en la Fase 1.
 *
 * La matriz completa vive en `docs/PERMISSIONS.md` §4. Aquí solo se siembran
 * los permisos cuyos módulos existen ya; cada fase añade los suyos al habilitar
 * su módulo. Un rol sin permisos en esta fase **no** es un error: significa que
 * su alcance llega más adelante.
 */
/**
 * `scopeKind` describe el eje por el que se acota el nombramiento, y tiene
 * consecuencias reales: al otorgar, un rol con permisos exige entidad jurídica
 * y uno de alcance ORGANIZATION exige además organización.
 *
 * Los roles de afiliación son de entidad, no globales. Se afilia una a Fuerza
 * Índigo o a Alianza Índigo, que son personas morales distintas; declararlos
 * globales fue lo que permitió que un nombramiento cruzara las dos (`D-F1-012`).
 * Solo quedan globales los dos roles sin permiso alguno.
 */
export interface RoleSeed {
  readonly code: RoleCode;
  readonly name: string;
  readonly description: string;
  readonly scopeKind: ScopeKind;
  readonly requiresOfficeTerm: boolean;
  readonly permissions: readonly string[];
}

export const ROLE_SEEDS: readonly RoleSeed[] = [
  {
    code: 'PUBLIC',
    name: 'Público',
    description: 'Contenido público, directorio autorizado y verificación de credenciales.',
    scopeKind: 'GLOBAL',
    requiresOfficeTerm: false,
    permissions: [],
  },
  {
    code: 'APPLICANT',
    name: 'Solicitante',
    description: 'Completar y consultar sus propias solicitudes.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'billing.payment.read_own',
      'billing.checkout.start',
      'files.file.download_own','files.file.upload'],
  },
  {
    code: 'PROTECTED_BENEFICIARY',
    name: 'Beneficiario protegido',
    description: 'Servicios, solicitudes y expedientes propios autorizados.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      // Sin `billing.checkout.start`, y no por olvido: un beneficiario
      // protegido recibe apoyo sin pagar ni afiliarse (PRD §14). Ponerle
      // delante un botón de cobro sería lo contrario de lo que ese estatuto
      // significa. Conserva la lectura de sus pagos por si alguna vez pagó
      // algo con otro rol.
      'billing.payment.read_own',
      'files.file.download_own','files.file.upload', 'consent.read'],
  },
  {
    code: 'HONORARY_AFFILIATE',
    name: 'Afiliado honorario',
    description: 'Membresía, beneficios y comunidad. Sin derechos electorales.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'billing.payment.read_own',
      'billing.checkout.start',
      'files.file.download_own','files.file.upload', 'consent.read'],
  },
  {
    code: 'UNION_MEMBER',
    name: 'Agremiado',
    description: 'Derechos sindicales, votación, directorio interno y representación.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'billing.accountability.read',
      'billing.payment.read_own',
      'billing.checkout.start',
      'files.file.download_own','files.file.upload', 'consent.read', 'territory.unit.read'],
  },
  {
    code: 'TERRITORIAL_DELEGATE',
    name: 'Delegado o representante territorial',
    description: 'Gestión limitada a su territorio y a las funciones delegadas.',
    scopeKind: 'TERRITORIAL',
    requiresOfficeTerm: true,
    permissions: [
      'billing.accountability.read',
      'files.file.download_own','identity.person.read', 'territory.unit.read', 'files.file.upload', 'files.file.download'],
  },
  {
    code: 'EXECUTIVE_SECRETARY',
    name: 'Secretaría del Comité Ejecutivo',
    description: 'Facultades correspondientes a su cartera.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: true,
    permissions: [
      'content.page.read',
      'content.page.write',
      'content.page.review',
      'content.page.publish',
      'content.page.revert',
      'support.request.read',
      'support.request.triage',
      // Aprobar, nunca registrar: quien registra un pago manual o pide una
      // devolución es Finanzas, y quien lo autoriza es esta cartera. Tener las
      // dos convertiría el doble control en una casilla que se marca sola.
      'billing.payment.approve_manual',
      'billing.refund.approve',
      // Un descuento y una beca son decisiones sobre a qué ingreso renuncia la
      // organización. Las autoriza la cartera que responde por las cuentas, no
      // quien administra el catálogo.
      'billing.discount.manage',
      'billing.discount.read',
      'billing.scholarship.manage',
      'billing.scholarship.read',
      'billing.asset.read',
      'billing.payment.read',
      'billing.payment.read_own',
      // No es una facultad de la cartera: es que quien nombra no puede otorgar
      // un rol con permisos que no tiene (regla de no elevación), y todos los
      // roles de afiliación llevan este. Sin él, la Secretaría Ejecutiva no
      // podría nombrar a ningún agremiado. Además le corresponde por derecho
      // propio: quien ocupa la cartera también paga su cuota.
      'billing.checkout.start',
      'billing.ledger.read',
      'billing.asset.manage',
      'billing.accountability.read',
      'files.file.download_own',
      'identity.person.read',
      'identity.person.update',
      'identity.person.read_sensitive',
      'identity.user.invite',
      'territory.unit.create',
      'territory.unit.update',
      'territory.unit.read',
      'territory.unit.dissolve',
      'consent.read',
      'files.file.upload',
      'files.file.download',
      'files.file.download_sensitive',
      'institution.legal_entity.read',
      'institution.normative_rules.manage',
      // `office.appoint` de la matriz de docs/PERMISSIONS.md §4. Nombrar es un
      // acto institucional del Comité Ejecutivo, no una función técnica: por eso
      // está aquí y no en la lista cerrada del Superadmin raíz. La regla de no
      // elevación acota lo que puede otorgar a lo que ya posee.
      'access.role.assign',
      'access.role.revoke',
    ],
  },
  {
    code: 'OVERSIGHT_COMMISSION',
    name: 'Comisión de Vigilancia y Fiscalización',
    description: 'Revisión financiera y de administración, sin facultades operativas incompatibles.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: true,
    permissions: [
      'content.page.read',
      // Revisión financiera **sin** facultades operativas: lee pagos, libro y
      // rendición de cuentas, y no puede registrar, aprobar ni cerrar nada.
      // La incompatibilidad está contratada en docs/PERMISSIONS.md §4.
      'billing.payment.read',
      'billing.ledger.read',
      'billing.discount.read',
      'billing.scholarship.read',
      'billing.asset.read',
      'billing.accountability.read',
      'files.file.download_own','identity.person.read', 'audit.audit.read', 'audit.security.read', 'audit.audit.export', 'territory.unit.read'],
  },
  {
    code: 'ELECTORAL_COMMISSION',
    name: 'Comisión Electoral',
    description: 'Gestión temporal del proceso electoral y del padrón de electores.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: true,
    permissions: [
      'files.file.download_own','identity.person.read', 'territory.unit.read'],
  },
  {
    code: 'SOCIAL_STAFF',
    name: 'Personal social de Alianza Índigo',
    description: 'Casos sociales asignados y programas autorizados.',
    scopeKind: 'ASSIGNMENT',
    requiresOfficeTerm: false,
    permissions: [
      'support.request.read',
      'support.request.triage',
      'files.file.download_own','identity.person.read', 'consent.grant', 'consent.read', 'files.file.upload', 'files.file.download'],
  },
  {
    code: 'CIAN_PROFESSIONAL',
    name: 'Profesional CIAN',
    description: 'Agenda, expediente y plan de atención de los casos asignados.',
    scopeKind: 'ASSIGNMENT',
    requiresOfficeTerm: false,
    permissions: [
      'files.file.download_own','identity.person.read', 'files.file.upload', 'files.file.download'],
  },
  {
    code: 'CIAN_COORDINATION',
    name: 'Coordinación CIAN',
    description: 'Operación, asignación, calidad y seguimiento de CIAN.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'billing.payment.read',
      'files.file.download_own','identity.person.read', 'identity.user.invite', 'files.file.upload', 'files.file.download'],
  },
  {
    code: 'CENI_ORG_USER',
    name: 'Usuario de organización CENI',
    description: 'Expediente y actividades de su propia organización.',
    scopeKind: 'ORGANIZATION',
    requiresOfficeTerm: false,
    permissions: [
      'billing.payment.read_own',
      'billing.checkout.start',
      'files.file.download_own','files.file.upload'],
  },
  {
    code: 'CENI_ASSESSOR',
    name: 'Evaluador CENI',
    description: 'Evaluaciones y evidencias expresamente asignadas.',
    scopeKind: 'ASSIGNMENT',
    requiresOfficeTerm: false,
    permissions: [
      'files.file.download_own','files.file.download'],
  },
  {
    code: 'CENI_COORDINATION',
    name: 'Coordinación CENI',
    description: 'Operación completa del programa CENI.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'billing.payment.read',
      'files.file.download_own','identity.person.read', 'identity.user.invite', 'files.file.download'],
  },
  {
    code: 'FINANCE',
    name: 'Finanzas',
    description: 'Catálogo, conciliación, reportes y comprobantes de su entidad jurídica.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'billing.catalog.manage',
      'billing.payment.read',
      'billing.payment.read_own',
      // Registra el pago manual, pero **no** lo aprueba: aprobar es de la
      // Secretaría Ejecutiva. Ahí está todo el doble control (PRD §11.3).
      'billing.payment.register_manual',
      'billing.refund.request',
      'billing.discount.read',
      'billing.scholarship.read',
      'billing.asset.read',
      'billing.ledger.read',
      'billing.ledger.adjust',
      'billing.reconciliation.close',
      'billing.asset.manage',
      'billing.report.export',
      'billing.accountability.read',
      'files.file.download_own','institution.legal_entity.read', 'files.file.download'],
  },
  {
    code: 'COMMUNICATIONS',
    name: 'Contenidos y comunicación',
    description: 'Gestión de contenidos, eventos y comunicaciones autorizadas.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'content.page.read',
      'content.page.write',
      'content.page.review',
      'content.page.publish',
      'content.page.revert',
      'content.redirect.manage',
      'files.file.download_own','files.file.upload', 'files.file.download'],
  },
  {
    code: 'AUDITOR',
    name: 'Auditor',
    description: 'Lectura de evidencia y bitácoras dentro de un alcance definido y temporal.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'content.page.read',
      // Solo lectura, como toda su cartera: ve el libro y los pagos para poder
      // auditarlos, y no puede mover ninguno.
      'billing.payment.read',
      'billing.ledger.read',
      'billing.discount.read',
      'billing.scholarship.read',
      'billing.asset.read',
      'billing.accountability.read',
      'files.file.download_own','audit.audit.read', 'audit.security.read', 'audit.audit.export', 'identity.person.read'],
  },
  {
    code: 'SUPERADMIN',
    name: 'Superadmin',
    description:
      'Configuración técnica integral. Su acceso NO proviene de este rol sino de las variables de entorno; la fila existe para que el catálogo de roles del PRD esté completo.',
    scopeKind: 'GLOBAL',
    requiresOfficeTerm: false,
    permissions: [],
  },
];
