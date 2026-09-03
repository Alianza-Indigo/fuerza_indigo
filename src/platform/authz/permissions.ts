import type { Compartment } from '@prisma-client/enums';

/**
 * Catálogo de permisos (docs/PERMISSIONS.md §3).
 *
 * Cada permiso declara su sensibilidad, si exige motivo escrito por la persona,
 * si exige una asignación viva sobre el recurso y a qué compartimento pertenece.
 */
export interface PermissionDefinition {
  readonly code: string;
  readonly module: string;
  readonly resource: string;
  readonly action: string;
  readonly sensitivity: 'NORMAL' | 'SENSITIVE' | 'CRITICAL';
  readonly requiresReason: boolean;
  readonly needsAssignment: boolean;
  readonly compartment: Compartment | null;
  readonly description: string;
}

const define = (
  code: string,
  description: string,
  options: Partial<Omit<PermissionDefinition, 'code' | 'description' | 'module' | 'resource' | 'action'>> = {},
): PermissionDefinition => {
  const [module = '', resource = '', action = ''] = code.split('.');
  return {
    code,
    module,
    resource,
    action,
    sensitivity: options.sensitivity ?? 'NORMAL',
    requiresReason: options.requiresReason ?? false,
    needsAssignment: options.needsAssignment ?? false,
    compartment: options.compartment ?? null,
    description,
  };
};

/**
 * Permisos de la Fase 1. Las fases posteriores añaden los suyos; el control
 * `C-F1-PERM` del verificador comprueba que cada permiso declarado aquí exista
 * también en la matriz documentada.
 */
export const PERMISSIONS: readonly PermissionDefinition[] = [
  // identity
  define('identity.person.read', 'Consultar el registro maestro de una persona'),
  define('identity.person.update', 'Editar los datos de una persona'),
  define('identity.person.merge', 'Resolver una duplicidad fusionando registros', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('identity.person.read_sensitive', 'Consultar datos personales sensibles', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('identity.user.invite', 'Invitar a una persona a crear su cuenta', { sensitivity: 'SENSITIVE' }),
  define('identity.user.disable', 'Deshabilitar una cuenta', { sensitivity: 'CRITICAL', requiresReason: true }),

  // access
  define('access.role.assign', 'Otorgar un rol a una cuenta', { sensitivity: 'CRITICAL', requiresReason: true }),
  define('access.role.revoke', 'Revocar un rol', { sensitivity: 'CRITICAL', requiresReason: true }),
  define('access.permission.read', 'Consultar el catálogo de permisos'),
  define('access.session.revoke_other', 'Cerrar la sesión de otra persona', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),

  // institution
  define('institution.legal_entity.manage', 'Administrar entidades jurídicas', { sensitivity: 'CRITICAL' }),
  define('institution.legal_entity.read', 'Consultar entidades jurídicas'),
  define('territory.unit.create', 'Crear una unidad territorial'),
  define('territory.unit.update', 'Editar una unidad territorial'),
  define('territory.unit.dissolve', 'Disolver una unidad territorial', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('territory.unit.read', 'Consultar unidades territoriales'),
  define('institution.normative_rules.manage', 'Publicar una versión de reglas estatutarias', {
    sensitivity: 'CRITICAL',
  }),

  // consent
  define('consent.grant', 'Registrar un consentimiento', { sensitivity: 'SENSITIVE' }),
  define('consent.revoke', 'Revocar un consentimiento', { sensitivity: 'SENSITIVE' }),
  define('consent.read', 'Consultar consentimientos de una persona', { sensitivity: 'SENSITIVE' }),

  // files
  define('files.file.upload', 'Adjuntar un archivo'),
  define('files.file.download', 'Descargar un archivo'),
  /**
   * La `O` de la matriz de docs/PERMISSIONS.md §4: **solo lo propio**.
   *
   * Sin este permiso, la titular de un documento no podía abrir su propio
   * archivo, porque los roles de afiliación no tienen la descarga general —y no
   * deben tenerla: concedería los archivos de las demás—. Exige asignación
   * viva, que para este permiso es precisamente la titularidad, y no exige
   * motivo escrito: pedirle a alguien que justifique por qué abre su propio
   * expediente sería tratarla como sospechosa de sí misma.
   */
  define('files.file.download_own', 'Descargar un archivo propio', { needsAssignment: true }),
  define('files.file.download_sensitive', 'Descargar material sensible o clínico', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
    needsAssignment: true,
  }),
  define('files.file.delete', 'Eliminar un archivo', { sensitivity: 'CRITICAL', requiresReason: true }),
  define('files.retention.manage', 'Administrar políticas de conservación', { sensitivity: 'CRITICAL' }),
  define('files.legalhold.manage', 'Colocar o levantar un bloqueo legal', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),

  // audit
  define('audit.audit.read', 'Consultar la bitácora institucional', { sensitivity: 'CRITICAL' }),
  define('audit.security.read', 'Consultar la bitácora de seguridad', { sensitivity: 'CRITICAL' }),
  define('audit.audit.export', 'Exportar bitácoras', { sensitivity: 'CRITICAL', requiresReason: true }),

  // system
  define('system.module.configure', 'Configurar módulos del sistema', { sensitivity: 'CRITICAL', requiresReason: true }),
  define('system.job.manage', 'Administrar trabajos programados', { sensitivity: 'CRITICAL', requiresReason: true }),
  define('system.health.read', 'Consultar la salud técnica del sistema'),
  define('system.integration.configure', 'Configurar integraciones externas', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
];

const BY_CODE = new Map(PERMISSIONS.map((permission) => [permission.code, permission]));

export function permission(code: string): PermissionDefinition | undefined {
  return BY_CODE.get(code);
}

export function permissionOrThrow(code: string): PermissionDefinition {
  const found = BY_CODE.get(code);
  if (found === undefined) throw new Error(`Permiso desconocido: ${code}. Debe declararse en el catálogo.`);
  return found;
}

/**
 * Conjunto CERRADO de concesión del Superadmin raíz (docs/PERMISSIONS.md §5.1).
 *
 * Es una lista de lo que **sí** puede, no de lo que no. La diferencia importa:
 * con una lista de vetos, cada permiso nuevo del sistema quedaría disponible
 * para el actor raíz salvo que alguien recordara vetarlo. Aquí, un permiso
 * nuevo le está denegado por no figurar.
 */
export const SUPERADMIN_GRANTED: ReadonlySet<string> = new Set([
  'system.module.configure',
  'system.job.manage',
  'system.health.read',
  'system.integration.configure',
  'access.permission.read',
  'access.session.revoke_other',
  'institution.legal_entity.manage',
  'institution.legal_entity.read',
  'territory.unit.read',
  'files.retention.manage',
  'files.legalhold.manage',
  'audit.audit.read',
  'audit.security.read',
  'identity.person.read',
  'identity.person.merge',
]);

/**
 * Permisos concedidos a cada tipo de trabajo programado. Un trabajo solo puede
 * lo que su tipo declara: no hereda un permiso total por ser «el sistema».
 */
export const JOB_GRANTS: Readonly<Record<string, ReadonlySet<string>>> = {
  'role-expiry': new Set(['access.role.revoke']),
  retention: new Set(['files.file.delete', 'files.retention.manage']),
  dispatch: new Set<string>(),
  health: new Set(['system.health.read']),
};
