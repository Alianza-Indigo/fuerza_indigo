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

  // content — CMS del sitio público (PRD §16.1)
  define('content.page.read', 'Consultar contenidos del CMS, incluidos los no publicados'),
  define('content.page.write', 'Crear y editar borradores de contenido'),
  define('content.page.review', 'Revisar un contenido enviado y aprobarlo o devolverlo', {
    sensitivity: 'SENSITIVE',
  }),
  /**
   * Publicar es un permiso aparte de escribir, y la separación no es burocracia:
   * es lo que hace que exista una revisión de verdad. Con un solo permiso,
   * quien redacta publica, y el paso de revisión se vuelve decorativo.
   */
  define('content.page.publish', 'Publicar, programar o archivar un contenido', {
    sensitivity: 'CRITICAL',
  }),
  define('content.page.revert', 'Revertir un contenido a una versión anterior', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('content.redirect.manage', 'Administrar redirecciones de direcciones antiguas'),

  // support — entrada única de ayuda y contacto (PRD §10.1, Fase 2)
  /**
   * Leer la bandeja es sensible aunque los mensajes lleguen por un formulario
   * abierto: quien escribe cuenta un conflicto laboral, una discriminación o
   * una urgencia, y lo cuenta con su nombre y su correo. Que la puerta esté en
   * la calle no hace pública la conversación.
   *
   * `request.create` no figura: crear una solicitud es lo que hace cualquiera
   * desde el formulario público, sin cuenta y sin permiso. Un permiso que todo
   * el mundo tiene no es un permiso, y declararlo invitaría a comprobarlo, que
   * es como se acaba exigiendo sesión para pedir ayuda.
   *
   * `request.route` tampoco: canalizar es de la Fase 6 y exige confirmación
   * humana sobre una propuesta que aquí todavía no se produce.
   */
  define('support.request.read', 'Consultar la entrada de solicitudes y contacto', {
    sensitivity: 'SENSITIVE',
  }),
  define('support.request.triage', 'Hacerse cargo de una solicitud recibida y anotarla', {
    sensitivity: 'SENSITIVE',
  }),

  // billing — catálogo, cobro, libro auxiliar y patrimonio (PRD §11, Fase 3)
  define('billing.catalog.manage', 'Administrar el catálogo de productos y precios', {
    sensitivity: 'CRITICAL',
  }),
  /**
   * Leer pagos es sensible y no crítico: hace falta para atender a quien
   * pregunta por su cobro, y exigir motivo escrito en cada consulta haría que
   * nadie pudiera contestar el teléfono.
   */
  define('billing.payment.read', 'Consultar pagos y su estado', { sensitivity: 'SENSITIVE' }),
  /**
   * Consultar **los propios** es un permiso distinto, por la misma razón que
   * descargar un archivo propio lo es de descargar el ajeno (ADR-0035): la
   * matriz de `docs/PERMISSIONS.md` §4 marca `O` para quien está afiliado, y un
   * solo permiso les daría los pagos de todas las demás personas.
   *
   * Exige titularidad, no asignación, y no pide motivo escrito: nadie tiene que
   * justificar por qué mira lo que pagó.
   */
  define('billing.payment.read_own', 'Consultar los pagos propios', { needsAssignment: true }),
  /**
   * Iniciar el pago de lo propio.
   *
   * Es un permiso y no una comprobación suelta de identidad porque hay personas
   * a las que la organización **no** quiere mandar a pagar: un beneficiario
   * protegido recibe apoyo sin pagar ni afiliarse (PRD §14), y ponerle un botón
   * de cobro delante sería exactamente lo contrario de lo que ese estatuto
   * significa. Con el permiso en el catálogo, esa decisión se ve y se audita.
   *
   * Exige titularidad: se paga la cuenta de cobro propia, no la de nadie más.
   */
  define('billing.checkout.start', 'Pagar un concepto del catálogo a nombre propio', {
    needsAssignment: true,
  }),
  /**
   * Registrar y aprobar un pago manual son **dos permisos**, y esa separación
   * es todo el doble control: con uno solo, quien registra aprueba, y el
   * control se vuelve una casilla.
   */
  define('billing.payment.register_manual', 'Registrar un pago recibido fuera de la plataforma', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('billing.payment.approve_manual', 'Aprobar un pago manual registrado por otra persona', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('billing.refund.request', 'Solicitar una devolución', { sensitivity: 'CRITICAL', requiresReason: true }),
  /**
   * Cupones, convenios y precios especiales.
   *
   * Otorgar un descuento es decidir a qué ingreso renuncia la organización, y
   * eso no es una tarea de administración del catálogo: es un acto de la
   * cartera que responde por las cuentas. Por eso `manage` y `read` son dos
   * permisos: quien lleva las finanzas necesita **ver** qué descuentos existen
   * para explicar un cobro, y no por ello puede crear uno.
   */
  define('billing.discount.manage', 'Otorgar o revocar un descuento, cupón o convenio', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('billing.discount.read', 'Consultar los descuentos vigentes'),
  /**
   * Becas y exenciones.
   *
   * Leerlas es **sensible** y no normal: una beca dice que alguien no puede
   * pagar, y eso es información sobre su situación económica. La justificación
   * que la respalda lo es todavía más. Se lee para revisar las cuentas y para
   * atender a quien pregunta, no para saber quién de la organización tiene
   * dificultades.
   */
  define('billing.scholarship.manage', 'Aprobar o revocar una beca o exención', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('billing.scholarship.read', 'Consultar becas y exenciones otorgadas', { sensitivity: 'SENSITIVE' }),
  define('billing.refund.approve', 'Aprobar una devolución solicitada por otra persona', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('billing.ledger.read', 'Consultar el libro auxiliar', { sensitivity: 'SENSITIVE' }),
  define('billing.ledger.adjust', 'Asentar un ajuste en el libro auxiliar', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  define('billing.reconciliation.close', 'Cerrar un corte de conciliación', { sensitivity: 'CRITICAL' }),
  define('billing.asset.manage', 'Administrar el registro patrimonial y sus movimientos', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  /**
   * Consultar el registro patrimonial es un permiso aparte de administrarlo.
   *
   * `asset.manage` exige motivo escrito, porque mover un bien del patrimonio lo
   * exige. Usar ese mismo permiso para **leer** la lista obligaría a justificar
   * por escrito cada consulta, que es lo que hace que nadie pueda contestar una
   * pregunta por teléfono (misma razón que en `payment.read`).
   *
   * Es sensible y no normal porque el registro dice en manos de quién está cada
   * bien, y eso es un dato de una persona identificable.
   */
  define('billing.asset.read', 'Consultar el registro patrimonial', { sensitivity: 'SENSITIVE' }),
  define('billing.report.export', 'Exportar reportes financieros', {
    sensitivity: 'CRITICAL',
    requiresReason: true,
  }),
  /**
   * Normal a propósito: la rendición de cuentas es un derecho de quien está
   * afiliado, no una facultad de la administración. Lo que muestra son totales
   * agregados, nunca el pago de una persona identificable.
   */
  define('billing.accountability.read', 'Consultar los reportes de rendición de cuentas'),

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
  /**
   * Del CMS, el actor raíz **no recibe nada**. Ni escritura, ni lectura, ni
   * encaminamiento.
   *
   * El PRD §16.1 dice que «el Superadmin y los roles de comunicación
   * autorizados» gestionan los contenidos, pero la arquitectura del actor raíz
   * lo impide en la parte editorial: no tiene fila en `User`, y toda versión
   * exige autoría identificada. Firmar un comunicado del sindicato con un actor
   * sin persona detrás dejaría sin respuesta la pregunta de quién lo publicó,
   * que es justo la que se hace cuando un comunicado se discute.
   *
   * Tampoco recibe la lectura. Un borrador de comunicado sobre un conflicto
   * laboral es deliberación interna del sindicato, y diagnosticar por qué una
   * página no aparece necesita su **estado**, no su cuerpo: eso lo da el panel
   * de salud sin leer una sola línea de texto (ADR-0042).
   *
   * `content.redirect.manage` sí estuvo aquí, con el argumento de que una
   * redirección es encaminamiento técnico y no voz institucional. Se retiró al
   * construir la pantalla que lo ejercería: el área de gestión exige cuenta y
   * el actor raíz no la tiene, así que no había forma de usarlo; y sin lectura
   * del gestor no puede saber qué páginas existen ni comprobar que un destino
   * sea el correcto. Un permiso que solo se puede ejercer a ciegas, y que
   * además no tiene pantalla, es una concesión decorativa: aparece en la lista
   * de lo que el actor más poderoso del sistema puede hacer sin que nadie lo
   * necesite (ADR-0048).
   *
   * Quien mantiene las direcciones es quien publica: las redirecciones las
   * tienen `COMMUNICATIONS` y `EXECUTIVE_SECRETARY`, que sí ven el gestor.
   */
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
  'content-schedule': new Set(['content.page.publish']),
};
