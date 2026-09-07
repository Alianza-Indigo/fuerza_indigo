import type { RoleCode, ScopeKind } from '../../../src/generated/prisma/enums';

/**
 * Los 14 roles base del PRD §4.2, con el conjunto de permisos que cada uno
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
      'membership.type.read',
      'membership.application.create_own',
      'membership.application.read_own',
      'membership.record.read_own',
      // Mirar lo propio no es un privilegio de la membresía (defecto
      // `D-F4-017`). Quien todavía no tiene credencial merece leer «todavía no
      // tienes credencial, se emite al activarse tu membresía», no «no tienes
      // autorización», que dice que la organización le niega algo suyo.
      'credentialing.credential.read_own',
      'membership.beneficiary.create_own',
      'membership.relationship.read_own',
      'membership.relationship.manage_own',
      'billing.payment.read_own',
      'billing.checkout.start',
      // Quien solicita acepta el aviso de privacidad al solicitar, y tiene que
      // poder retirarlo después (defecto `D-F4-009`). Sin esta pareja, el sí de
      // la persona solo podía registrarlo la organización.
      'consent.grant_own',
      'consent.revoke_own',
      'consent.read_own',
      'files.file.download_own','files.file.upload'],
  },
  {
    code: 'PROTECTED_BENEFICIARY',
    name: 'Beneficiario protegido',
    description: 'Servicios, solicitudes y expedientes propios autorizados.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'membership.type.read',
      'membership.application.create_own',
      'membership.application.read_own',
      'membership.record.read_own',
      'membership.beneficiary.create_own',
      'membership.relationship.read_own',
      'membership.relationship.manage_own',
      'membership.beneficiary.read_own',
      // Sin `billing.checkout.start`, y no por olvido: un beneficiario
      // protegido recibe apoyo sin pagar ni afiliarse (PRD §14). Ponerle
      // delante un botón de cobro sería lo contrario de lo que ese estatuto
      // significa. Conserva la lectura de sus pagos por si alguna vez pagó
      // algo con otro rol.
      'billing.payment.read_own',
      // Su propio expediente, y solo el suyo (Fase 6). Quien pide ayuda tiene
      // derecho a ver en qué va lo suyo; lo reservado del equipo nunca se le
      // muestra, y eso lo decide el caso de uso al leer, no la pantalla al
      // pintar.
      'cases.case.read_own',
      'files.file.download_own','files.file.upload', 'consent.read_own',
      'consent.grant_own', 'consent.revoke_own'],
  },
  {
    code: 'HONORARY_AFFILIATE',
    name: 'Afiliado honorario',
    description: 'Membresía, beneficios y comunidad. Sin derechos electorales.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'membership.type.read',
      'membership.application.create_own',
      'membership.application.read_own',
      'membership.record.read_own',
      'membership.beneficiary.create_own',
      'membership.relationship.read_own',
      'membership.relationship.manage_own',
      'credentialing.credential.read_own',
      'directory.publication.manage_own',
      'billing.payment.read_own',
      'billing.checkout.start',
      // Su propio expediente, y solo el suyo (Fase 6). Quien pide ayuda tiene
      // derecho a ver en qué va lo suyo; lo reservado del equipo nunca se le
      // muestra, y eso lo decide el caso de uso al leer, no la pantalla al
      // pintar.
      'cases.case.read_own',
      'files.file.download_own','files.file.upload', 'consent.read_own',
      'consent.grant_own', 'consent.revoke_own'],
  },
  {
    code: 'UNION_MEMBER',
    name: 'Agremiado',
    description: 'Derechos sindicales, votación, directorio interno y representación.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'membership.type.read',
      'membership.application.create_own',
      'membership.application.read_own',
      'membership.record.read_own',
      'membership.beneficiary.create_own',
      'membership.relationship.read_own',
      'membership.relationship.manage_own',
      'membership.beneficiary.create',
      'credentialing.credential.read_own',
      'directory.publication.manage_own',
      'directory.internal.read',
      'billing.accountability.read',
      'billing.payment.read_own',
      'billing.checkout.start',
      // Vida sindical (Fase 5). Vota, ve las asambleas y sus acuerdos, y si
      // alguna vez se le abre un procedimiento, puede leer el suyo.
      'assembly.assembly.read',
      'voting.ballot.cast',
      'voting.process.read',
      'governance.body.read',
      'discipline.case.read_own',
      // Su propio expediente de defensa, y solo el suyo (Fase 6).
      'cases.case.read_own',
      'files.file.download_own','files.file.upload', 'consent.read_own', 'territory.unit.read',
      'consent.grant_own', 'consent.revoke_own'],
  },
  {
    code: 'TERRITORIAL_DELEGATE',
    name: 'Delegado o representante territorial',
    description: 'Gestión limitada a su territorio y a las funciones delegadas.',
    scopeKind: 'TERRITORIAL',
    requiresOfficeTerm: true,
    permissions: [
      'membership.type.read',
      'membership.application.create_own',
      'membership.application.read_own',
      'membership.record.read_own',
      'membership.beneficiary.create_own',
      'membership.relationship.read_own',
      'membership.relationship.manage_own',
      'membership.application.create',
      'membership.application.read',
      'membership.application.review',
      'membership.record.read',
      'membership.roster.read',
      'membership.roster.export',
      'membership.beneficiary.create',
      'membership.beneficiary.read',
      'membership.relationship.read',
      'credentialing.credential.read',
      'credentialing.credential.read_own',
      'directory.internal.read',
      'directory.publication.manage_own',
      'billing.accountability.read',
      // Vida sindical de su territorio (Fase 5).
      'governance.body.read',
      'assembly.assembly.convene',
      'assembly.assembly.read',
      'assembly.agenda.manage',
      'assembly.attendance.register',
      'assembly.quorum.declare',
      'assembly.followup.manage',
      'voting.process.read',
      'voting.ballot.cast',
      'election.incident.manage',
      'compliance.obligation.read',
      'documents.document.read',
      'discipline.case.read_own',
      // Defensa en su territorio (Fase 6). Abre y lleva expedientes asignados;
      // no supervisa —no lee lo reservado— ni acepta canalizaciones de la otra
      // entidad, que es un acto de quien responde por el área receptora.
      'cases.case.open',
      'cases.case.read',
      'cases.case.read_own',
      'cases.case.update',
      'cases.case.close',
      'cases.participant.manage',
      'cases.task.manage',
      'cases.message.send',
      'cases.document.manage',
      'cases.referral.propose',
      'cases.emergency.raise',
      'cases.indicator.read',
      // IA (Fase 8). Prepara informes de su territorio con apoyo del modelo y
      // responde por lo que sale: lee la salida y decide si la acepta. No
      // redacta prompts ni toca la base documental —qué puede leer el modelo no
      // se decide territorio por territorio (PRD §15.3, §15.5)—.
      'ai.generation.read',
      'ai.generation.review',
      'files.file.download_own',
      'identity.person.read',
      'territory.unit.read',
      'files.file.upload',
      'files.file.download',
      // Revisa solicitudes de afiliación, y sus documentos —identificaciones,
      // constancias laborales— se guardan como datos personales sensibles. Sin
      // esta facultad revisaba expedientes cuyos documentos no podía abrir.
      //
      // Lo clínico sigue fuera: `cases.document.read_clinical` no está aquí, y
      // es justo la autorización expresa que el PRD §10.3 exige para que un rol
      // sindical vea un diagnóstico. Poder abrir material sensible por su
      // función no es poder abrir el diagnóstico de nadie.
      'files.file.download_sensitive',
    ],
  },
  {
    code: 'EXECUTIVE_SECRETARY',
    name: 'Secretaría del Comité Ejecutivo',
    description: 'Facultades correspondientes a su cartera.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: true,
    permissions: [
      'membership.type.read',
      'membership.application.create_own',
      'membership.application.read_own',
      'membership.record.read_own',
      'membership.beneficiary.create_own',
      'membership.relationship.read_own',
      'membership.relationship.manage_own',
      'membership.type.manage',
      'membership.application.create',
      'membership.application.read',
      'membership.application.review',
      'membership.application.resolve',
      'membership.record.read',
      'membership.record.suspend',
      'membership.record.terminate',
      'membership.roster.read',
      'membership.roster.export',
      // Quien lleva el padrón lleva su cumplimiento ante la autoridad: separar
      // las dos cosas dejaría el expediente sin titular, que es como se pierde
      // un trámite (defecto `D-F4-003`, aprendido).
      'membership.authority_filing.manage',
      'membership.beneficiary.create',
      'membership.beneficiary.read',
      'membership.beneficiary.update',
      'membership.relationship.read',
      'membership.relationship.manage',
      'credentialing.credential.issue',
      'credentialing.credential.revoke',
      'credentialing.credential.read',
      'credentialing.credential.read_own',
      'directory.internal.read',
      'directory.internal.export',
      'directory.publication.manage',
      'directory.publication.manage_own',
      // Gobierno y vida institucional (Fase 5). Convoca, asienta y publica.
      // **No** escruta ni certifica una votación, ni valida planillas: eso es
      // de la Comisión Electoral, y juntarlo sería juez y parte.
      'territory.unit.create',
      'territory.unit.update',
      'governance.body.manage',
      'governance.body.read',
      'governance.office.appoint',
      'governance.office.end',
      'governance.power.grant',
      'governance.power.revoke',
      'governance.rules.manage',
      'assembly.assembly.convene',
      'assembly.assembly.read',
      'assembly.agenda.manage',
      'assembly.roster.freeze',
      'assembly.attendance.register',
      'assembly.quorum.declare',
      'assembly.resolution.record',
      'assembly.minutes.publish',
      'assembly.followup.manage',
      'voting.process.read',
      'voting.ballot.cast',
      'bargaining.file.manage',
      'bargaining.file.read',
      'bargaining.consultation.open',
      'bargaining.strike.file_open',
      // Defensa, casos y canalización (Fase 6). Responde por el expediente
      // sindical: lo abre, lo asigna, lo reabre y **acepta o devuelve** lo que
      // llega canalizado desde la otra entidad. Leer lo reservado y abrir un
      // documento clínico son facultades aparte, y las tiene porque es quien
      // supervisa; ninguna de las dos se ejerce sin motivo escrito ni sin estar
      // asignada al expediente.
      'cases.case.open',
      'cases.case.read',
      'cases.case.read_own',
      'cases.case.update',
      'cases.case.assign',
      'cases.case.close',
      'cases.case.reopen',
      'cases.participant.manage',
      'cases.task.manage',
      'cases.message.send',
      'cases.message.read_reserved',
      'cases.document.manage',
      'cases.document.read_clinical',
      'cases.referral.propose',
      'cases.referral.accept',
      'cases.emergency.raise',
      'cases.emergency.acknowledge',
      'cases.indicator.read',
      'discipline.case.open',
      'discipline.case.read',
      'discipline.case.read_own',
      'discipline.evidence.manage',
      'discipline.decision.issue',
      'compliance.obligation.manage',
      'compliance.obligation.read',
      'compliance.archive.read',
      'documents.template.manage',
      'documents.document.issue',
      'documents.document.read',
      'consent.version.manage',
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
      // Resolver una duplicidad es trabajo de la Secretaría de Organización, que
      // es quien lleva el padrón. Sin este permiso el registro maestro tenía una
      // pantalla de fusión que nadie en toda la instalación podía usar.
      'identity.person.merge',
      'identity.user.invite',
      // Quien abre la puerta la cierra (defecto `D-F4-003`). Separar invitar de
      // cerrar dejaría a esta cartera sin poder deshacer su propio error, y a la
      // organización sin forma de cerrar la cuenta de quien ya se fue.
      'identity.user.disable',
      'territory.unit.create',
      'territory.unit.update',
      'territory.unit.read',
      'territory.unit.dissolve',
      // Registrar el sí de otra persona y retirarlo son facultades distintas de
      // consultarlo, y esta cartera lleva el padrón: es quien recoge un
      // consentimiento en papel y quien lo retira cuando la persona lo pide por
      // escrito (defecto `D-F4-009`). `consent.revoke` no lo tenía nadie en toda
      // la instalación, así que la pantalla de retiro no habría podido usarse.
      'consent.grant',
      'consent.revoke',
      // También las variantes propias, y no por simetría decorativa: esta es la
      // única cartera que nombra, y la regla de no elevación le impide otorgar
      // un rol con un permiso que ella no tenga. Sin estas dos no podría nombrar
      // a ningún agremiado ni afiliado honorario. Además es cierto de por sí:
      // quien lleva el padrón también es una persona con consentimientos suyos.
      'consent.grant_own',
      'consent.revoke_own',
      'consent.read',
      'consent.read_own',
      'files.file.upload',
      'files.file.download',
      'files.file.download_sensitive',
      'institution.legal_entity.read',
      'institution.normative_rules.manage',
      // `office.appoint` de la matriz de docs/PERMISSIONS.md §4. Nombrar es un
      // acto institucional del Comité Ejecutivo, no una función técnica: por eso
      // está aquí y no en la lista cerrada del Superadmin raíz. La regla de no
      // elevación acota lo que puede otorgar a lo que ya posee.
      // IA (Fase 8). Publica los prompts que no escribió —la base exige que
      // quien revisa no sea quien redactó—, fija los límites de gasto y el
      // encendido, y decide qué fuentes puede leer el modelo. Redactar no está
      // aquí a propósito: si publicar y redactar cayeran en la misma mano, la
      // revisión humana del PRD §15.3 dependería de la buena costumbre.
      'ai.prompt.read',
      'ai.prompt.publish',
      'ai.provider.configure',
      'ai.knowledge.manage',
      'ai.generation.read',
      'ai.generation.review',
      'ai.usage.read',
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
      'membership.type.read',
      'membership.record.read',
      'membership.roster.read',
      'directory.internal.read',
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
      // Vigilancia (Fase 5): lee la vida institucional entera y resuelve los
      // recursos. No convoca, no asienta y no dicta sanciones: vigilar y
      // ejecutar en la misma mano no es vigilar.
      'governance.body.read',
      'assembly.assembly.read',
      'assembly.followup.manage',
      'voting.process.read',
      'voting.ballot.cast',
      'bargaining.file.read',
      'discipline.case.read',
      'discipline.appeal.resolve',
      'compliance.obligation.read',
      'compliance.archive.read',
      'documents.document.read',
      // IA (Fase 8). Fiscaliza el gasto del modelo y lee las instrucciones con
      // las que opera. No lee lo generado: vigilar cuánto cuesta la IA no exige
      // leer lo que alguien le contó en una orientación (PRD §24 Fase 8).
      'ai.usage.read',
      'ai.prompt.read',
      'files.file.download_own','identity.person.read', 'audit.audit.read', 'audit.security.read', 'audit.audit.export', 'territory.unit.read'],
  },
  {
    code: 'ELECTORAL_COMMISSION',
    name: 'Comisión Electoral',
    description: 'Gestión temporal del proceso electoral y del padrón de electores.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: true,
    permissions: [
      'membership.type.read',
      'membership.record.read',
      'membership.roster.read',
      'membership.roster.export',
      'directory.internal.read',
      // El proceso electoral entero (Fase 5). Congela el padrón de electores,
      // valida planillas, escruta y certifica. Nada de esto lo tiene la
      // Secretaría: la incompatibilidad es el punto.
      'governance.body.read',
      'assembly.assembly.read',
      'assembly.roster.freeze',
      'election.election.manage',
      'election.slate.register',
      'election.slate.validate',
      'election.roster.publish',
      'election.incident.manage',
      'election.evidence.export',
      'voting.process.manage',
      'voting.credential.issue',
      'voting.tally.run',
      'voting.tally.certify',
      'voting.process.read',
      'voting.ballot.cast',
      'documents.document.read',
      'files.file.download_own','identity.person.read', 'territory.unit.read'],
  },
  {
    code: 'SOCIAL_STAFF',
    name: 'Personal social de Alianza Índigo',
    description: 'Casos sociales asignados y programas autorizados.',
    scopeKind: 'ASSIGNMENT',
    requiresOfficeTerm: false,
    permissions: [
      'membership.type.read',
      'membership.application.create',
      'membership.beneficiary.create',
      'membership.beneficiary.read',
      'membership.beneficiary.update',
      'membership.relationship.read',
      'membership.relationship.manage',
      'support.request.read',
      'support.request.triage',
      // Atención social (Fase 6). Lleva expedientes sociales **asignados**: el
      // compartimento lo pone el expediente y la asignación la comprueba el
      // caso de uso. No acepta canalizaciones por sí sola —eso lo hace quien
      // responde por el área— ni abre documentos clínicos sin autorización
      // expresa, que es un permiso aparte y con nombre (PRD §10.3).
      'cases.case.open',
      'cases.case.read',
      'cases.case.update',
      'cases.case.close',
      'cases.participant.manage',
      'cases.task.manage',
      'cases.message.send',
      'cases.document.manage',
      'cases.referral.propose',
      'cases.emergency.raise',
      'cases.emergency.acknowledge',
      'cases.indicator.read',
      // IA (Fase 8). La clasificación sugerida y el resumen de un expediente
      // los revisa quien lleva el expediente. Sin `review` la sugerencia no
      // surte efecto; con él, surte efecto porque una persona lo dijo.
      'ai.generation.read',
      'ai.generation.review',
      'files.file.download_own','identity.person.read', 'consent.grant', 'consent.revoke', 'consent.read', 'files.file.upload', 'files.file.download'],
  },
  {
    code: 'FINANCE',
    name: 'Finanzas',
    description: 'Catálogo, conciliación, reportes y comprobantes de su entidad jurídica.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'membership.type.read',
      'membership.record.read',
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
      'directory.publication.manage',
      'consent.version.manage',
      'content.page.read',
      'content.page.write',
      'content.page.review',
      'content.page.publish',
      'content.page.revert',
      'content.redirect.manage',
      // El catálogo del ecosistema es contenido: cambiar la dirección de una
      // plataforma es un acto editorial, y quien mantiene el sitio público es
      // quien lo hace (Fase 7).
      // IA (Fase 8). Redacta los prompts y los prueba en el laboratorio, y
      // mantiene la base documental pública del modelo, que es material
      // editorial. Publicar no: lo hace la Secretaría, y esa es la revisión.
      'ai.prompt.read',
      'ai.prompt.edit',
      'ai.knowledge.manage',
      'ai.generation.read',
      'ai.generation.review',
      'ecosystem.link.manage',
      'files.file.download_own','files.file.upload', 'files.file.download'],
  },
  {
    code: 'AUDITOR',
    name: 'Auditor',
    description: 'Lectura de evidencia y bitácoras dentro de un alcance definido y temporal.',
    scopeKind: 'LEGAL_ENTITY',
    requiresOfficeTerm: false,
    permissions: [
      'membership.type.read',
      'membership.application.read',
      'membership.record.read',
      'membership.roster.read',
      'membership.beneficiary.read',
      'directory.internal.read',
      'credentialing.credential.read',
      // Lectura acotada de la vida institucional (Fase 5).
      'governance.body.read',
      'assembly.assembly.read',
      'voting.process.read',
      'compliance.obligation.read',
      'compliance.archive.read',
      'documents.document.read',
      'content.page.read',
      // Solo lectura, como toda su cartera: ve el libro y los pagos para poder
      // auditarlos, y no puede mover ninguno.
      'billing.payment.read',
      'billing.ledger.read',
      'billing.discount.read',
      'billing.scholarship.read',
      'billing.asset.read',
      'billing.accountability.read',
      // IA (Fase 8). Solo lectura, como toda su cartera: la instrucción, la
      // salida y el costo. Auditar una salida sin el prompt que la produjo es
      // auditar la mitad. No revisa: decidir si una salida vale es del área que
      // responde por ella, no de quien la audita después.
      'ai.prompt.read',
      'ai.generation.read',
      'ai.usage.read',
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
