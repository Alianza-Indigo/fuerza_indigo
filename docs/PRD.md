# PRD IA MAESTRO

## Plataforma Integral del Sindicato Unión de Inclusión y Derechos Neurodivergentes "Fuerza Índigo"

**Versión:** 1.0  
**Fecha:** 3 de septiembre de 2026  
**Dominio principal previsto:** `fuerzaindigo.lat`  
**Tipo de documento:** Especificación integral para agentes de desarrollo de software  
**Estado:** Base maestra aprobada para construcción por fases

---

# 0. INSTRUCCIÓN DE SISTEMA PARA EL AGENTE DE CÓDIGO

Este documento no es una colección de ideas ni una propuesta preliminar. Es la especificación maestra para construir una plataforma completa, productiva y verificable. El agente deberá tomar decisiones técnicas razonables dentro de las reglas aquí establecidas, sin trasladar preguntas técnicas al usuario y sin reducir el alcance a un MVP.

El agente deberá:

1. Leer el documento completo antes de modificar el repositorio.
2. Inspeccionar el estado real del repositorio y conservar cualquier implementación correcta existente.
3. Construir exclusivamente la fase activa.
4. Terminar la fase activa al 100% antes de iniciar otra.
5. Implementar frontend, backend, datos, permisos, validaciones, auditoría, pruebas y documentación de cada función incluida en la fase.
6. Resolver los defectos encontrados dentro de la fase propietaria, sin ocultarlos ni posponerlos.
7. Mantener actualizados `docs/PHASE_STATUS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/ENVIRONMENT.md` y `docs/DECISIONS.md`.
8. Detenerse al concluir cada fase, emitir el informe de cierre y esperar la autorización del usuario para continuar.

## 0.1 Regla de no improvisación

Cuando falte una decisión puramente técnica, el agente deberá elegir la alternativa que:

1. respete este PRD;
2. sea compatible con Vercel, Neon, Prisma y Vercel Blob;
3. reduzca deuda técnica;
4. preserve seguridad, trazabilidad y accesibilidad;
5. sea mantenible por otros agentes;
6. evite dependencias innecesarias.

El agente no preguntará al usuario qué ORM, patrón de API, biblioteca de formularios, estructura de carpetas, estrategia de validación o biblioteca de pruebas debe utilizar. Esas son decisiones del agente y deberán registrarse en `docs/DECISIONS.md`.

## 0.2 Prohibición absoluta de Supabase

No se utilizará Supabase bajo ninguna circunstancia. La prohibición comprende:

- base de datos;
- autenticación;
- almacenamiento;
- funciones;
- tiempo real;
- SDK cliente o servidor;
- paquetes, adaptadores o tipos;
- variables de entorno;
- referencias en documentación;
- código residual o configuraciones heredadas.

Una búsqueda global de `supabase`, sin distinguir mayúsculas y minúsculas, deberá devolver cero coincidencias en código productivo, dependencias y documentación final, excepto dentro del propio control de cumplimiento que explique que está prohibido.

## 0.3 Prohibición de alcance mínimo

No se construirá un MVP. Cada módulo habilitado deberá ser utilizable en producción y cubrir sus flujos normales, alternos, vacíos, de error, autorización, cancelación y auditoría. No se permiten botones sin acción, datos simulados en producción, pantallas provisionales, secciones "próximamente", `TODO`, `FIXME` ni funciones incompletas pertenecientes a la fase activa.

---

# 1. RESUMEN EJECUTIVO

Fuerza Índigo será el corazón organizativo del ecosistema Alianza Índigo: una plataforma nacional, extensible a Latinoamérica, que reúna organización sindical, afiliación, representación, protección comunitaria, atención social, servicios profesionales, formación, tecnología, inclusión institucional y sostenibilidad económica.

La plataforma no será solamente un sitio institucional ni un padrón digital. Será el sistema operativo de:

- el Sindicato Unión de Inclusión y Derechos Neurodivergentes "Fuerza Índigo";
- Alianza Índigo Neurodivergente A.C.;
- el Centro Integral de Atención Neurodivergente, CIAN;
- la Certificación de Entornos Neuroinclusivos, CENI;
- las herramientas tecnológicas ADIA, NEXO, NeuroPlan y las que se incorporen posteriormente;
- la red territorial, profesional, empresarial y comunitaria del ecosistema.

El producto permitirá que una persona llegue por cualquier puerta del ecosistema, sea identificada correctamente, otorgue los consentimientos necesarios y reciba una ruta de atención coherente. La persona no tendrá que comprender la estructura jurídica interna para saber dónde pedir ayuda.

## 1.1 Fórmula institucional

> Fuerza Índigo representa y defiende. Alianza Índigo atiende y acompaña. CENI genera sostenibilidad y transforma organizaciones. CIAN presta atención integral. La tecnología conecta y escala el ecosistema.

## 1.2 Objetivos del producto

1. Organizar y mantener un padrón sindical confiable, verificable y actualizado.
2. Formalizar la afiliación honoraria de personas neurodivergentes, familiares y personas cuidadoras.
3. Registrar y atender beneficiarios protegidos aunque no tengan afiliación.
4. Dar a los agremiados herramientas reales de representación, participación y defensa.
5. Crear una red territorial mediante delegaciones, secciones y representaciones.
6. Canalizar necesidades sociales hacia Alianza Índigo y CIAN.
7. Conectar a cada perfil con ADIA, NEXO, NeuroPlan y futuras herramientas.
8. Gestionar CENI como vínculo con empresas, escuelas, instituciones y organizaciones.
9. Procesar cuotas, membresías, suscripciones, servicios y renovaciones mediante Stripe.
10. Ofrecer orientación asistida por Gemini sin sustituir decisiones humanas sensibles.
11. Mantener separación jurídica, financiera, documental y de permisos entre el sindicato y la A.C.
12. Entregar una experiencia moderna, neuroinclusiva, segura y usable desde dispositivos móviles.

## 1.3 Indicadores de éxito

- Porcentaje de solicitudes de afiliación concluidas.
- Tiempo medio de revisión y resolución de solicitudes.
- Número de agremiados activos, afiliados honorarios y beneficiarios protegidos.
- Porcentaje del padrón con datos y consentimientos vigentes.
- Tasa de pago y renovación de cuotas o membresías.
- Casos atendidos, canalizados, resueltos y reabiertos.
- Tiempo de primera respuesta a una solicitud de apoyo.
- Uso de herramientas tecnológicas por perfil y territorio.
- Personas atendidas y planes activos en CIAN.
- Organizaciones incorporadas, evaluadas y certificadas mediante CENI.
- Participación y quórum en asambleas y procesos electorales.
- Incidentes de acceso indebido a datos sensibles: objetivo cero.
- Errores críticos en producción: objetivo cero.

---

# 2. FUENTE NORMATIVA Y ARQUITECTURA INSTITUCIONAL

## 2.1 Fuente de verdad

Los Estatutos del Sindicato Unión de Inclusión y Derechos Neurodivergentes "Fuerza Índigo" constituyen la fuente normativa primaria para:

- calidad y admisión de agremiados;
- derechos y obligaciones;
- beneficiarios protegidos;
- órganos de gobierno;
- facultades de las secretarías;
- asambleas, quórum y votaciones;
- elecciones;
- secciones y delegaciones;
- régimen disciplinario;
- confidencialidad;
- rendición de cuentas;
- actualización del padrón ante la autoridad competente.

La afiliación honoraria se considerará activa desde el lanzamiento. El producto se construirá conforme a la decisión institucional de modificar los estatutos para reconocerla como una categoría vigente, no como una función futura sujeta a activación posterior.

Si existe contradicción entre una regla operativa y los estatutos vigentes, el sistema no deberá ejecutar automáticamente el acto controvertido. Deberá marcarlo para revisión institucional, conservar la evidencia y permitir actualizar la regla mediante una versión posterior debidamente aprobada.

## 2.2 Entidades del ecosistema

### Fuerza Índigo

Responsable de:

- afiliación sindical;
- padrón de agremiados;
- afiliación honoraria;
- representación y defensa laboral;
- estructura territorial;
- asambleas y vida democrática;
- elecciones y votaciones;
- cuotas sindicales;
- convenios colectivos;
- órganos de gobierno;
- transparencia sindical;
- registro y seguimiento de obligaciones frente a autoridades laborales.

### Alianza Índigo Neurodivergente A.C.

Responsable de la parte social del ecosistema:

- atención comunitaria;
- programas para personas neurodivergentes y familias;
- acompañamiento social;
- administración de beneficiarios protegidos canalizados;
- operación o coordinación de CIAN;
- becas, apoyos y convenios sociales;
- proyectos tecnológicos de beneficio comunitario;
- programas financiados mediante aportaciones, servicios o alianzas.

### CIAN

Brazo de atención integral para evaluación inicial, orientación, canalización, planes de atención, seguimiento profesional, coordinación familiar y servicios relacionados con neurodivergencia. CIAN no realizará diagnósticos automáticos mediante IA.

### CENI

Programa de inclusión institucional y motor económico del ecosistema. Atenderá organizaciones mediante diagnóstico, capacitación, evaluación, planes de mejora, evidencias, certificación, renovación y distintivos verificables.

### Herramientas tecnológicas

ADIA, NEXO, NeuroPlan y futuras soluciones conformarán una capa modular de herramientas de apoyo. La plataforma central administrará descubrimiento, elegibilidad, accesos, consentimientos, lanzamientos e indicadores, sin acoplarse de forma irreversible a una herramienta específica.

## 2.3 Separación obligatoria

Aunque el usuario perciba una experiencia integrada, la plataforma deberá separar:

- entidad jurídica responsable;
- cuenta y catálogo de Stripe;
- ingresos, comprobantes y conciliación;
- contratos y documentos;
- avisos de privacidad y consentimientos;
- responsables internos;
- permisos de acceso;
- expedientes sociales, sindicales, clínicos o institucionales;
- numeración y series documentales;
- reportes y auditorías.

Ningún usuario obtendrá acceso transversal solo por trabajar en una entidad del ecosistema. El acceso se concederá por función, territorio, expediente y necesidad legítima.

---

# 3. PERSONAS, MEMBRESÍAS Y RELACIONES

## 3.1 Registro único de persona

Cada ser humano tendrá un solo registro maestro de persona. Sobre ese registro podrán coexistir distintas relaciones con el ecosistema. No se duplicará a una persona por ser simultáneamente agremiada, familiar, profesional de CIAN o representante de una organización CENI.

El registro maestro separará:

- identidad personal;
- medios de contacto;
- domicilio y territorio;
- cuenta de acceso;
- membresías y calidades;
- roles operativos;
- consentimientos;
- expedientes;
- preferencias de directorio;
- relaciones familiares o de cuidado;
- historial y auditoría.

## 3.2 Agremiado

Persona trabajadora mayor de quince años que desempeña una especialidad, oficio o profesión y que, en el ejercicio de su actividad, tiene contacto de cualquier índole con personas neurodivergentes. Podrá ser trabajadora subordinada, independiente, autónoma o por cuenta propia.

El sistema permitirá acreditar su actividad mediante documentos, declaración, constancias, referencias u otros mecanismos definidos por la Secretaría de Organización. La admisión siempre requerirá revisión humana y resolución registrable.

Derechos digitales principales:

- voz y voto cuando se encuentre en pleno goce de derechos;
- elegibilidad conforme a reglas vigentes;
- acceso a asambleas, convocatorias y acuerdos;
- credencial sindical;
- representación y defensa;
- capacitación y certificaciones;
- beneficios y herramientas autorizadas;
- consulta de cuotas e historial propio.

## 3.3 Afiliado honorario

Persona neurodivergente, familiar o persona cuidadora vinculada formalmente con Fuerza Índigo sin adquirir por ese hecho derechos políticos sindicales.

Tendrá:

- solicitud y aprobación propia;
- membresía con vigencia;
- credencial diferenciada;
- beneficios configurables;
- acceso a comunidad, programas y herramientas;
- historial de pagos cuando corresponda;
- acceso a sus documentos;
- posibilidad de convertirse en agremiado mediante un trámite separado si cumple los requisitos.

No podrá:

- votar;
- integrar el quórum;
- ser electo a órganos reservados para agremiados;
- consultar información sindical reservada;
- aparecer como agremiado ante autoridades.

## 3.4 Beneficiario protegido

Persona neurodivergente, familiar o persona cuidadora que recibe orientación, defensa, acompañamiento, atención o canalización como beneficiaria del objeto social, sin necesidad de afiliación sindical.

La calidad de beneficiario protegido:

- no concede derechos electorales;
- no genera automáticamente una cuota;
- no se incorpora al padrón sindical remitido a autoridades;
- puede existir sin cuenta digital propia;
- puede estar vinculada a una persona responsable cuando sea menor de edad o requiera representación;
- puede coexistir con la calidad de agremiado o afiliado honorario;
- tendrá controles reforzados de privacidad.

## 3.5 Relaciones familiares y de cuidado

El sistema soportará relaciones muchos-a-muchos entre personas:

- madre, padre o tutor;
- hija o hijo;
- cónyuge o pareja;
- familiar;
- cuidador principal o secundario;
- representante autorizado;
- contacto de emergencia;
- profesional responsable.

Cada relación tendrá vigencia, alcance, evidencia, consentimiento y permisos propios. Una relación familiar no otorgará automáticamente acceso a expedientes.

## 3.6 Estados de membresía

Estados mínimos:

- borrador;
- enviada;
- documentación pendiente;
- en revisión;
- entrevista o aclaración requerida;
- aprobada;
- rechazada con motivo;
- activa;
- suspendida;
- vencida;
- en proceso disciplinario;
- baja voluntaria;
- pérdida de calidad;
- fallecimiento;
- cancelada por duplicidad o error administrativo.

Todo cambio de estado requerirá motivo, actor, fecha y registro de auditoría. Los estados con efectos jurídicos no podrán modificarse mediante edición directa de base de datos desde la interfaz.

---

# 4. USUARIOS, ROLES Y CONTROL DE ACCESO

## 4.1 Principio de acceso

Se utilizará control de acceso por roles y atributos. El permiso efectivo dependerá de:

- rol;
- entidad jurídica;
- territorio;
- módulo;
- expediente asignado;
- relación con la persona;
- estado de membresía;
- consentimiento;
- sensibilidad del dato;
- vigencia del nombramiento.

## 4.2 Roles base

| Rol | Alcance principal |
|---|---|
| Público | Contenido público, directorio autorizado y verificaciones QR mínimas |
| Solicitante | Completar y consultar sus propias solicitudes |
| Beneficiario protegido | Servicios, solicitudes y expedientes propios autorizados |
| Afiliado honorario | Membresía, beneficios, herramientas y comunidad sin derechos electorales |
| Agremiado | Derechos sindicales, votación, directorio interno, cuotas y representación |
| Delegado o representante territorial | Gestión limitada a su territorio y funciones delegadas |
| Secretaría del Comité Ejecutivo | Facultades correspondientes a su cartera |
| Comisión de Vigilancia | Revisión financiera y de administración sin facultades operativas incompatibles |
| Comisión Electoral | Gestión temporal de procesos electorales y padrón de electores |
| Personal social de Alianza Índigo | Casos sociales asignados y programas autorizados |
| Profesional CIAN | Agenda, expediente y plan de atención de casos asignados |
| Coordinación CIAN | Operación, asignación, calidad y seguimiento de CIAN |
| Usuario de organización CENI | Expediente y actividades de su propia organización |
| Evaluador CENI | Evaluaciones y evidencias expresamente asignadas |
| Coordinación CENI | Operación completa del programa CENI |
| Finanzas | Catálogo, conciliación, reportes y comprobantes de su entidad jurídica |
| Contenidos y comunicación | CMS, eventos y comunicaciones autorizadas |
| Auditor | Lectura de evidencia y bitácoras dentro de un alcance definido |
| Superadmin | Configuración técnica integral, sin adquirir derechos sindicales por el acceso |

## 4.3 Separación de cargo y acceso

Los cargos sindicales y roles operativos tendrán fecha de inicio y fin. Al concluir un nombramiento, el acceso asociado se revocará automáticamente sin borrar el historial. La sustitución de una persona no transferirá sus credenciales ni sesiones.

## 4.4 Superadmin por variables de entorno

Existirá una ruta independiente `/superadmin/login`. El acceso raíz se definirá mediante:

- `SUPERADMIN_EMAIL`;
- `SUPERADMIN_PASSWORD_HASH`;
- `AUTH_SECRET`;
- `SUPERADMIN_SESSION_VERSION` para invalidación de sesiones cuando sea necesario.

El Superadmin raíz:

- no dependerá de un registro editable en la base de datos;
- no aparecerá en padrones ni directorios;
- no podrá votar ni ejecutar actos sindicales por su calidad técnica;
- usará sesión firmada, segura, de duración limitada y revocable;
- estará sujeto a límite de intentos, alertas y auditoría;
- tendrá que indicar motivo para acciones críticas de soporte;
- no podrá ver datos sensibles de forma masiva sin una acción explícita y auditada.

El repositorio incluirá un comando local documentado, equivalente a `npm run auth:hash-password`, para generar de forma segura el valor de `SUPERADMIN_PASSWORD_HASH` sin almacenar la contraseña original.

Los administradores ordinarios sí deberán existir como personas y recibir permisos mediante nombramientos.

---

# 5. EXPERIENCIA DE USUARIO Y SISTEMA DE DISEÑO

## 5.1 Estándar visual

Todas las interfaces deberán ser modernas, completas y de calidad comercial. No se aceptará la apariencia predeterminada de una plantilla, un panel administrativo genérico ni minimalismo vacío. El diseño deberá comunicar fuerza colectiva, dignidad, inclusión, confianza y capacidad institucional.

La base recomendada será Tailwind CSS y componentes accesibles de shadcn/ui o equivalente, completamente personalizados mediante tokens propios. Ningún componente de biblioteca se considerará terminado hasta adaptarse a la identidad visual.

## 5.2 Principios

- móvil primero;
- adaptable desde 360 px hasta escritorio amplio;
- navegación consistente;
- jerarquía visual inequívoca;
- densidad equilibrada;
- acciones principales visibles;
- lenguaje claro y no paternalista;
- información contextual suficiente;
- retroalimentación inmediata;
- prevención de errores;
- recuperación de borradores;
- accesibilidad por teclado;
- contraste suficiente;
- etiquetas visibles en formularios;
- objetivos táctiles cómodos;
- modo claro y oscuro;
- reducción de movimiento;
- ampliación de texto;
- control de densidad visual;
- compatibilidad con lectores de pantalla;
- español como idioma inicial y arquitectura internacionalizable.

## 5.3 Accesibilidad cognitiva y neuroinclusión

- procesos largos divididos en pasos comprensibles;
- indicador de avance y tiempo estimado;
- guardado automático;
- posibilidad de pausar y continuar;
- resúmenes antes de enviar;
- instrucciones con ejemplos cuando sean útiles;
- una decisión principal por bloque;
- errores explicados junto al campo correspondiente;
- ausencia de parpadeos, reproducción automática o animaciones invasivas;
- preferencias sensoriales persistentes por usuario;
- modo de enfoque que reduzca elementos secundarios;
- no exigir que el usuario comprenda términos jurídicos o técnicos para completar un trámite.

## 5.4 Estados obligatorios de interfaz

Cada pantalla o componente de datos deberá diseñar y probar:

- carga inicial;
- carga incremental;
- vacío genuino;
- ausencia de resultados por filtros;
- error recuperable;
- error de autorización;
- sesión expirada;
- funcionamiento exitoso;
- confirmación antes de acciones sensibles;
- deshacer cuando resulte seguro;
- funcionamiento con conexión lenta o intermitente.

## 5.5 Navegación por experiencia

No existirá un único panel saturado para todos. La navegación se compondrá según persona, membresía, cargo, entidad y tareas. Cada panel abrirá con prioridades reales: pagos pendientes, documentos faltantes, citas próximas, votaciones abiertas, casos que requieren atención o renovaciones.

---

# 6. MAPA FUNCIONAL

## 6.1 Sitio público

- Inicio.
- Qué es Fuerza Índigo.
- Sindicato y derechos.
- Alianza Índigo y acción social.
- Afíliate como agremiado.
- Afiliación honoraria.
- Solicitar protección o apoyo.
- Directorio público de miembros que autoricen aparecer.
- Delegaciones y presencia territorial.
- Herramientas tecnológicas.
- CIAN.
- CENI.
- Cursos, eventos y convocatorias públicas.
- Organizaciones con certificación CENI vigente.
- Transparencia pública autorizada.
- Noticias y recursos.
- Contacto.
- Verificador de credenciales y distintivos QR.
- Avisos de privacidad, términos, accesibilidad y canal de derechos de datos.

## 6.2 Portal personal

- Inicio personalizado.
- Mi perfil.
- Mi relación con Fuerza Índigo.
- Solicitudes y documentos.
- Credenciales.
- Pagos, cuotas, membresías y comprobantes.
- Beneficios.
- Herramientas tecnológicas.
- Solicitudes de apoyo y casos.
- CIAN.
- Actividad CENI, cuando aplique.
- Asambleas, votaciones y acuerdos, solo para quien tenga derecho.
- Eventos y capacitación.
- Notificaciones.
- Consentimientos y privacidad.
- Preferencias de directorio.
- Seguridad y sesiones.

## 6.3 Panel territorial

- Resumen de la delegación o sección.
- Padrón dentro del alcance autorizado.
- Solicitudes pendientes.
- Casos y canalizaciones.
- Actividades y eventos.
- Documentos territoriales.
- Indicadores agregados.
- Comunicaciones.
- Reportes al Comité Ejecutivo Nacional.
- Directorio de responsables.

## 6.4 Panel institucional

- Asamblea General.
- Comité Ejecutivo Nacional.
- Secretarías.
- Comisión de Vigilancia y Fiscalización.
- Comisión Electoral.
- Delegaciones y secciones.
- Padrón sindical.
- Obligaciones y reportes.
- Actas, acuerdos y archivo histórico.
- Representación y conflictos.
- Finanzas y rendición de cuentas.
- Régimen disciplinario.

## 6.5 Panel de Superadmin

- Estado general del sistema.
- Entidades jurídicas.
- Personas, cuentas y roles.
- Configuración de módulos.
- Catálogo y Stripe.
- CIAN y CENI.
- Herramientas e integraciones.
- Gemini, modelos, prompts y límites.
- Contenido público.
- Plantillas de documentos y mensajes.
- Trabajos programados y webhooks.
- Archivos y políticas de retención.
- Auditoría y seguridad.
- Salud técnica, versiones y migraciones.

---

# 7. DIRECTORIOS, PADRONES Y CREDENCIALES

## 7.1 Padrones separados

El sistema mantendrá, como mínimo:

1. padrón de agremiados;
2. padrón de afiliados honorarios;
3. padrón de beneficiarios protegidos;
4. padrón de cargos y autoridades;
5. directorio de profesionales;
6. directorio de organizaciones CENI;
7. directorio público derivado exclusivamente de autorizaciones expresas.

Ningún padrón se construirá mediante una vista que mezcle categorías sin mostrar su calidad exacta.

## 7.2 Directorio interno

Permitirá búsqueda y filtros por:

- nombre;
- número de miembro;
- categoría;
- estado de membresía;
- especialidad, oficio o profesión;
- entidad federativa, municipio, país, delegación o sección;
- cargo vigente;
- disponibilidad profesional;
- certificaciones y habilidades verificadas;
- vigencia de credencial;
- situación de cuotas, únicamente para roles autorizados.

Las exportaciones deberán respetar el mismo alcance del usuario, requerir motivo, generar marca temporal y dejar auditoría.

## 7.3 Directorio público

Cada persona elegible podrá decidir:

- no aparecer;
- aparecer solo por nombre y territorio;
- mostrar fotografía;
- mostrar perfil profesional;
- mostrar medios profesionales de contacto;
- permitir indexación por buscadores;
- aparecer sin indexación;
- retirar la autorización en cualquier momento.

El consentimiento será granular, versionado y revocable. Los beneficiarios protegidos no aparecerán públicamente por defecto y los menores no podrán publicarse sin una base y autorización específicas aprobadas institucionalmente.

## 7.4 Credenciales QR

Habrá diseños claramente diferenciados para:

- agremiado;
- afiliado honorario;
- cargo o representación;
- profesional autorizado;
- certificación o distintivo CENI, en su módulo propio.

El QR contendrá un identificador opaco y firmado, no datos personales. La página de verificación mostrará solo:

- nombre o denominación autorizada;
- fotografía cuando corresponda;
- tipo de credencial;
- estado actual;
- vigencia;
- territorio o cargo público autorizado;
- número parcial o público de verificación.

La revocación deberá surtir efecto inmediatamente. Las credenciales podrán descargarse en formato digital e imprimible. Toda consulta de verificación se registrará de forma agregada, sin crear perfiles invasivos de quien escanea.

---

# 8. AFILIACIÓN Y ADMISIÓN

## 8.1 Flujo de agremiado

1. La persona conoce requisitos en lenguaje claro.
2. Crea cuenta o inicia solicitud asistida.
3. Captura identidad, contacto, territorio y actividad laboral o profesional.
4. Declara la forma en que su actividad se relaciona con personas neurodivergentes.
5. Declara su situación respecto de la pertenencia simultánea a otro sindicato del mismo gremio y adjunta la aclaración que corresponda.
6. Adjunta evidencia cuando corresponda.
7. Acepta estatutos, avisos, obligaciones y declaraciones aplicables.
8. Revisa un resumen y envía.
9. Secretaría de Organización revisa sin alterar la solicitud original.
10. Puede requerir aclaración con plazo y mensajería trazable.
11. La autoridad competente aprueba o rechaza con fundamento y motivo.
12. Cuando exista cuota de inscripción, el sistema crea el cobro correspondiente.
13. Cumplidos resolución y pago, se activa la membresía y se emite credencial.
14. La alta queda preparada para el informe o trámite ante la autoridad laboral.

## 8.2 Flujo de afiliación honoraria

1. Selección de perfil: persona neurodivergente, familiar o cuidadora.
2. Registro de persona y relaciones necesarias.
3. Elección de membresía y beneficios.
4. Consentimientos.
5. Revisión institucional cuando la política lo exija.
6. Pago mediante Stripe cuando exista costo.
7. Activación, credencial diferenciada y acceso a beneficios.

## 8.3 Flujo de beneficiario protegido

Podrá iniciarse por:

- la propia persona;
- familiar o cuidador autorizado;
- agremiado;
- delegado;
- personal de Alianza Índigo;
- CIAN;
- canalización externa.

El sistema registrará origen, necesidad inicial, consentimiento, nivel de urgencia, territorio y entidad responsable. La persona podrá recibir apoyo sin pagar ni afiliarse.

## 8.4 Conversión sin duplicidad

Una persona podrá pasar de beneficiaria protegida a afiliada honoraria o agremiada conservando su registro, consentimientos vigentes, relaciones y expedientes permitidos. La conversión no fusionará automáticamente información reservada entre entidades o módulos.

---

# 9. ESTRUCTURA SINDICAL, TERRITORIO Y GOBIERNO

## 9.1 Estructura territorial

El sistema soportará:

- nacional;
- país extranjero;
- entidad federativa o región equivalente;
- municipio, alcaldía o localidad;
- sección;
- delegación;
- representación u oficina;
- ámbito virtual o temático cuando sea autorizado.

Cada unidad tendrá nombre, tipo, territorio, estado, fecha de creación, acuerdo habilitante, responsables, vigencia, documentos y relaciones jerárquicas.

## 9.2 Órganos y cargos

Se modelarán:

- Asamblea General;
- Comité Ejecutivo Nacional;
- secretarías estatutarias y adicionales;
- Comisión de Vigilancia y Fiscalización;
- Comisión Electoral;
- delegados seccionales;
- comisiones temporales;
- personas apoderadas y alcances documentados.

Los cargos serán registros históricos con periodo, forma de designación, documento probatorio, facultades y suplencias. No serán simples etiquetas permanentes sobre un usuario.

### Matriz operativa de órganos y secretarías

| Órgano o secretaría | Capacidades principales en la plataforma |
|---|---|
| Asamblea General | Convocatorias, quórum, deliberación, votación, acuerdos y archivo de actas |
| Secretaría General | Representación, presidencia de asambleas, firma y seguimiento de actos, poderes y supervisión general |
| Secretaría de Organización | Admisiones, padrones, credenciales, altas y bajas, delegaciones, secciones e informes |
| Secretaría de Trabajo y Conflictos | Casos laborales, representación, conflictos individuales y colectivos, negociación y seguimiento |
| Secretaría de Finanzas y Tesorería | Cuotas, patrimonio, pagos, conciliación, presupuesto y rendición semestral de cuentas |
| Secretaría de Actas y Acuerdos | Actas, acuerdos, certificación de copias, archivo documental y acervo histórico |
| Secretaría de Neuroinclusión y Enlace Familiar | Beneficiarios protegidos, defensa e inclusión, enlace familiar, programas y canalizaciones sociales |
| Secretaría de Equidad y Género | Proporcionalidad, políticas, protocolos y quejas internas relacionadas con discriminación de género |
| Secretaría de Prensa y Propaganda | Comunicación, medios oficiales, convocatorias, acuerdos, resultados y contenidos públicos |
| Comisión de Vigilancia y Fiscalización | Revisión independiente de contabilidad, administración, irregularidades e informes |
| Comisión Electoral | Calendario, padrón electoral, candidaturas, jornada, escrutinio, resultados e incidencias |

Cada capacidad se convertirá en permisos específicos; el nombre del cargo no concederá acceso ilimitado a todo el sistema.

## 9.3 Proporcionalidad y composición

El sistema calculará la composición vigente del padrón y apoyará la verificación de las reglas de representación proporcional de género establecidas en los estatutos. Mostrará alertas antes de registrar una planilla o integración incompatible, pero la determinación formal corresponderá al órgano competente. Los cálculos conservarán la fotografía del padrón utilizada y no revelarán información personal innecesaria.

Las reglas estatutarias tendrán versiones con vigencia. La configuración inicial reflejará, entre otras, las siguientes condiciones:

- periodo de cuatro años para el Comité Ejecutivo Nacional;
- posibilidad de reelección conforme a los estatutos vigentes;
- Comisión de Vigilancia integrada por tres agremiados que no formen parte del Comité Ejecutivo Nacional;
- Comisión Electoral integrada por tres agremiados que no sean candidatos en el proceso que califiquen;
- delegados seccionales electos por los agremiados de la sección correspondiente.

## 9.4 Asambleas

El módulo incluirá:

- tipo de asamblea;
- autoridad convocante;
- primera y segunda convocatoria;
- fecha, hora, lugar y modalidad;
- orden del día;
- documentos previos;
- reglas de elegibilidad;
- padrón congelado para la sesión;
- registro de asistencia;
- verificación de quórum;
- participación con voz o voto;
- propuestas y resoluciones;
- votaciones;
- acta, anexos y firmas;
- publicación según nivel de reserva;
- seguimiento de acuerdos.

El sistema calculará quórum, pero una persona autorizada deberá declarar y firmar el resultado. No modificará retrospectivamente el padrón congelado de una asamblea concluida.

La configuración estatutaria inicial contemplará:

- Asamblea Ordinaria al menos una vez al año;
- Asamblea Extraordinaria convocada por el Comité Ejecutivo Nacional, la Comisión de Vigilancia y Fiscalización o la solicitud escrita del porcentaje estatutario de agremiados;
- anticipación mínima de convocatoria conforme a los estatutos vigentes;
- primera convocatoria con la mitad más uno del padrón aplicable;
- segunda convocatoria con los agremiados presentes;
- mayoría simple como regla general;
- mayorías calificadas para modificación estatutaria, disolución y demás supuestos aplicables.

Los valores se conservarán por versión normativa para que una reforma no altere retrospectivamente asambleas anteriores.

## 9.5 Elecciones

El módulo electoral garantizará:

- Comisión Electoral sin candidaturas incompatibles;
- calendario y convocatoria;
- padrón de electores publicado conforme a reglas vigentes;
- registro y validación de planillas o candidaturas;
- voto personal, libre, secreto y directo;
- prevención de voto duplicado;
- secreto del sentido individual del voto;
- escrutinio verificable;
- acta de resultados;
- incidencias e impugnaciones internas;
- exportación de evidencia requerida por autoridad competente.

La identidad del votante y la boleta se separarán criptográfica y lógicamente. La auditoría demostrará elegibilidad y emisión de voto sin revelar su contenido.

## 9.6 Contratos colectivos, consultas y conflictos colectivos

El sistema administrará expedientes separados para:

- negociación de contratos colectivos;
- revisión contractual o salarial;
- comisión negociadora;
- documentos y versiones de propuestas;
- consulta de agremiados afectados;
- padrón específico congelado;
- voto personal, libre, secreto y directo;
- acta y resultado de consulta;
- emplazamiento, conciliación y, cuando corresponda, procedimiento de huelga;
- acuerdo de la Asamblea y mayoría aplicable;
- plazos, actuaciones y documentos ante autoridades.

La plataforma apoyará los cálculos y la conservación de evidencia, pero no declarará automáticamente la validez jurídica de una consulta, contrato o huelga.

## 9.7 Publicidad y reserva institucional

- Las deliberaciones sobre casos individuales serán reservadas.
- Las actas de Asamblea, estatutos vigentes e informes financieros semestrales estarán disponibles para los agremiados conforme a las reglas aplicables.
- Las versiones públicas deberán excluir datos personales y anexos reservados.
- Cada documento tendrá nivel de acceso, fundamento interno, versión y periodo de publicación.
- Las altas y bajas, cambios de directiva y modificaciones estatutarias tendrán un expediente de cumplimiento y estado de notificación ante la autoridad laboral competente.

## 9.8 Régimen disciplinario

Incluirá:

- reporte de posible falta;
- control de conflicto de interés;
- apertura formal;
- notificación de hechos;
- acceso del agremiado a su expediente;
- derecho de audiencia;
- ofrecimiento y valoración de pruebas;
- resolución fundada;
- sanción configurada;
- recurso ante la Asamblea;
- suspensión y restitución de derechos;
- registro histórico reservado.

Ninguna IA impondrá sanciones ni recomendará automáticamente culpabilidad.

## 9.9 Pérdida de calidad y cierre institucional

El sistema distinguirá renuncia voluntaria, inactividad laboral relevante conforme a estatutos, expulsión mediante procedimiento, fallecimiento y corrección administrativa. La pérdida de calidad revocará derechos futuros, pero conservará padrón histórico, pagos, actos válidos, votos secretos ya emitidos y expediente de respaldo.

Una eventual disolución solo podrá registrarse a partir del acuerdo y procedimiento correspondientes. El sistema generará un archivo institucional, inventario de obligaciones, patrimonio y trazabilidad de liquidación; nunca eliminará masivamente los registros como consecuencia automática de cambiar el estado de la organización.

---

# 10. PROTECCIÓN, DEFENSA Y ATENCIÓN SOCIAL

## 10.1 Entrada única de ayuda

La plataforma presentará una acción visible: **Solicitar apoyo**. El formulario hará preguntas de información, no preguntas técnicas o jurídicas. Con base en las respuestas, el sistema propondrá una canalización que deberá ser confirmada por personal autorizado.

Tipos iniciales:

- conflicto laboral individual;
- conflicto colectivo;
- discriminación o falta de ajustes;
- acceso educativo;
- acceso a salud;
- accesibilidad;
- orientación familiar;
- necesidad de atención CIAN;
- riesgo psicosocial;
- violencia o urgencia;
- capacitación o apoyo institucional;
- otro asunto relacionado con el objeto.

## 10.2 Expediente de caso

Cada caso tendrá:

- folio;
- persona solicitante;
- personas relacionadas;
- calidad de cada participante;
- entidad responsable;
- territorio;
- tipo y prioridad;
- resumen original inalterable;
- valoración humana;
- responsable y equipo;
- tareas, plazos y próximos pasos;
- comunicaciones;
- documentos;
- consentimientos;
- canalizaciones;
- bitácora;
- resultado y motivo de cierre;
- reapertura controlada.

## 10.3 Seguridad de casos

- acceso por asignación y necesidad legítima;
- separación entre expediente sindical, social y CIAN;
- documentos con clasificación de sensibilidad;
- descargas mediante autorización temporal;
- marca de agua en exportaciones sensibles cuando corresponda;
- auditoría de lectura, descarga, edición y compartición;
- ocultamiento de diagnósticos y datos clínicos a roles sindicales sin autorización;
- protocolo visible para riesgo inmediato, sin presentar a la IA como servicio de emergencia.

## 10.4 Canalización entre Fuerza Índigo y Alianza Índigo

La canalización requerirá:

1. explicación comprensible a la persona;
2. consentimiento específico para compartir la información necesaria;
3. selección de datos y documentos que se transfieren;
4. aceptación por el área receptora;
5. seguimiento del estado sin exponer notas reservadas;
6. cierre o devolución con motivo.

---

# 11. PAGOS, MEMBRESÍAS Y STRIPE

## 11.1 Alcance comercial y financiero

Stripe procesará:

- cuota de inscripción;
- cuotas sindicales ordinarias y extraordinarias autorizadas;
- membresías honorarias;
- suscripciones a servicios;
- cursos, talleres y diplomados;
- servicios CIAN;
- programas, evaluaciones y certificaciones CENI;
- renovaciones;
- becas parciales, descuentos, convenios y códigos promocionales;
- aportaciones destinadas a Alianza Índigo cuando resulten aplicables.

Los precios y conceptos no estarán codificados en el frontend. Se administrarán mediante catálogo versionado, con identificadores de Stripe y entidad receptora.

## 11.2 Separación por entidad

La arquitectura admitirá conexiones Stripe independientes:

- cuenta de Fuerza Índigo para conceptos sindicales;
- cuenta de Alianza Índigo para programas sociales, CIAN, CENI y conceptos que jurídicamente le correspondan.

Las claves permanecerán en variables de entorno. Cada webhook tendrá secreto propio. Si inicialmente se opera una sola cuenta autorizada, el modelo de datos conservará desde el primer día la entidad receptora y permitirá migrar a cuentas separadas sin reconstruir pagos históricos.

## 11.3 Funciones de cobro

- Checkout seguro alojado por Stripe;
- suscripciones recurrentes;
- pagos únicos;
- portal de cliente;
- cupones y precios especiales;
- periodos de gracia configurables;
- reintentos y recuperación de pagos;
- cancelación al final del periodo o inmediata conforme al producto;
- reembolsos autorizados;
- comprobantes y facturas externas vinculables;
- conciliación;
- becas o exenciones documentadas;
- pagos manuales registrados por finanzas con evidencia y doble control.

## 11.4 Webhooks

Los webhooks serán la fuente de verdad del estado financiero. Todo evento deberá:

- validar firma;
- persistirse antes de procesarse;
- ser idempotente;
- registrar cuenta Stripe y versión del evento;
- poder reintentarse;
- actualizar pagos y derechos de acceso mediante transacciones;
- generar alerta si queda sin conciliar;
- impedir duplicidad de membresías o ingresos.

El retorno exitoso del navegador nunca se usará como única prueba de pago.

## 11.5 Rendición de cuentas

El sistema generará cortes, movimientos y reportes semestrales para apoyar la rendición de cuentas sindical. Los informes se producirán desde un libro auxiliar inmutable derivado de pagos, ajustes autorizados y comprobantes, conservando quién creó, revisó y aprobó cada ajuste.

También existirá un registro patrimonial de bienes muebles, inmuebles, cuentas y otros activos, con entidad propietaria, forma de adquisición, valor documental, ubicación, responsable, comprobantes, estado y movimientos. Los actos que requieran aprobación institucional no podrán marcarse como concluidos sin adjuntar el acuerdo correspondiente.

---

# 12. HERRAMIENTAS TECNOLÓGICAS DE APOYO

## 12.1 Catálogo

Cada herramienta tendrá:

- nombre, descripción e identidad visual;
- entidad responsable;
- público objetivo;
- requisitos de elegibilidad;
- modalidad de acceso;
- plan o beneficio que la incluye;
- URL o integración;
- estado operativo;
- aviso de privacidad y términos propios;
- soporte;
- indicadores autorizados.

Herramientas iniciales:

- NeuroPlan;
- ADIA;
- NEXO.

## 12.2 Modalidades de integración

La capa de integración admitirá:

- módulo nativo;
- enlace profundo autenticado;
- inicio de sesión firmado de corta duración;
- integración por API;
- acceso externo sin intercambio de identidad, cuando corresponda.

No se utilizarán iframes inseguros ni se compartirán datos sensibles por parámetros de URL. Cada lanzamiento quedará registrado sin almacenar innecesariamente el contenido utilizado dentro de la herramienta.

## 12.3 Derechos de acceso

Los accesos podrán originarse en:

- membresía activa;
- beneficio sindical;
- programa social;
- beca;
- contratación individual;
- contratación de una organización CENI;
- asignación de CIAN;
- campaña o convenio;
- autorización administrativa con vigencia.

El usuario verá por qué tiene acceso, hasta cuándo y qué ocurrirá al terminar su vigencia. La revocación no borrará sus datos sin aplicar la política de conservación correspondiente.

## 12.4 Experiencia unificada

El panel recomendará herramientas con base en perfil y necesidades declaradas, sin inferir ni exhibir diagnósticos. Las recomendaciones de IA serán explicables, opcionales y nunca condicionarán la protección sindical o social.

---

# 13. CIAN

## 13.1 Objetivo

CIAN coordinará la atención integral de personas neurodivergentes y sus familias mediante una ruta clara, humana y trazable, desde la solicitud inicial hasta el seguimiento.

## 13.2 Funciones

- admisión y entrevista inicial;
- consentimiento informado y privacidad;
- valoración de necesidades;
- canalización a neurología u otras especialidades cuando sea necesaria una evaluación diagnóstica;
- directorio de profesionales y centros;
- agenda y disponibilidad;
- citas presenciales o remotas;
- expediente de atención;
- plan individual o familiar;
- objetivos, actividades y seguimiento;
- terapias y servicios;
- notas profesionales con acceso restringido;
- coordinación con familia o cuidadores autorizados;
- becas y apoyos;
- pagos y comprobantes;
- derivación a NeuroPlan u otras herramientas;
- encuestas de experiencia y resultados;
- cierre, alta o canalización externa.

## 13.3 Límites

- Gemini no emitirá diagnósticos.
- El personal sin función asistencial no verá notas clínicas.
- Una afiliación no condicionará la atención urgente ni los programas gratuitos definidos.
- Los profesionales solo accederán a personas asignadas.
- Las notas no se reutilizarán para fines sindicales, comerciales o CENI sin consentimiento específico y base autorizada.

## 13.4 Panel de CIAN

- bandeja de nuevas solicitudes;
- triage humano;
- agenda;
- asignación profesional;
- lista de espera;
- expedientes;
- planes activos;
- alertas de seguimiento;
- pagos y becas;
- capacidad de profesionales;
- indicadores agregados y anonimizados;
- calidad, incidencias y satisfacción.

---

# 14. CENI

## 14.1 Objetivo

CENI permitirá acompañar a empresas, escuelas, instituciones públicas, organizaciones civiles y otros espacios en la creación y verificación de entornos neuroinclusivos.

## 14.2 Expediente de organización

- razón social y nombre comercial;
- tipo de organización;
- responsables y usuarios autorizados;
- sedes y centros de trabajo;
- sector y tamaño;
- contratos y convenios;
- facturación y pagos;
- programas contratados;
- evaluaciones;
- evidencias;
- planes de mejora;
- capacitaciones;
- certificaciones, vigencias y renovaciones;
- incidencias y comunicaciones.

## 14.3 Ciclo CENI

1. Prospección o solicitud.
2. Alta de organización y responsables.
3. Selección de CENI Laboral, CENI Espacios u otra línea configurada.
4. Contratación y pago.
5. Diagnóstico inicial.
6. Carga y validación de evidencias.
7. Evaluación.
8. Plan de mejora con responsables y fechas.
9. Capacitación y acompañamiento.
10. Verificación de cumplimiento.
11. Decisión humana de certificación.
12. Emisión de certificado y distintivo QR.
13. Seguimiento y renovación.

## 14.4 Evidencias y evaluación

- formularios versionados;
- criterios y ponderaciones versionados;
- evidencia documental, fotográfica y de enlace;
- comentarios y solicitudes de corrección;
- trazabilidad del evaluador;
- prohibición de alterar una evaluación cerrada;
- nueva versión para reevaluaciones;
- indicadores y hallazgos;
- plan de acción;
- conflictos de interés;
- revisión y decisión final humanas.

## 14.5 Certificados y distintivos

Cada certificado tendrá número único, organización, sede o alcance, línea CENI, nivel, fecha de emisión, vigencia, estado y QR firmado. La verificación pública mostrará información vigente y marcará claramente certificados suspendidos, vencidos o revocados.

## 14.6 Vinculación con Fuerza Índigo

CENI podrá:

- ofrecer oportunidades laborales a agremiados;
- localizar capacitadores y especialistas;
- gestionar convenios;
- recibir canalizaciones institucionales;
- generar información agregada sobre barreras de inclusión;
- facilitar acciones de mejora sin exponer casos personales ni datos sensibles.

---

# 15. INTELIGENCIA ARTIFICIAL CON GEMINI

## 15.1 Proveedor

Gemini será el único proveedor inicial de IA. Se integrará mediante el SDK oficial de Google ejecutado exclusivamente en servidor. Claves, modelos y límites se configurarán mediante variables de entorno y configuración administrativa segura.

## 15.2 Casos de uso

- orientación inicial;
- explicación de trámites y estatutos en lenguaje claro;
- clasificación sugerida de solicitudes;
- generación de resúmenes;
- apoyo para redactar comunicaciones y documentos;
- extracción estructurada de documentos autorizados;
- preparación de informes para delegados;
- apoyo a NeuroPlan, ADIA y NEXO;
- análisis asistido de evidencia CENI;
- apoyo administrativo CIAN sin diagnóstico;
- búsqueda semántica sobre una base documental autorizada;
- traducción y adaptación de lenguaje.

## 15.3 Prompts administrables

Los prompts no estarán dispersos en el código. El sistema manejará:

- propósito;
- módulo;
- versión;
- texto de sistema;
- variables permitidas;
- modelo;
- parámetros;
- fuentes autorizadas;
- esquema de salida;
- límites;
- estado borrador, prueba, publicado o retirado;
- autor, revisor y fecha;
- historial y reversión.

La publicación de un prompt crítico requerirá revisión humana y quedará auditada.

## 15.4 Límites de decisión

La IA no podrá decidir:

- admisión o rechazo de afiliaciones;
- suspensión o expulsión;
- elegibilidad electoral definitiva;
- sentido o validez de un voto;
- resolución de conflictos;
- otorgamiento de representación legal;
- diagnóstico médico o psicológico;
- certificación CENI;
- autorización de pagos o reembolsos;
- acceso a expedientes;
- publicación de datos personales.

## 15.5 Privacidad y trazabilidad

- minimización de datos enviados al modelo;
- redacción o seudonimización cuando sea posible;
- consentimiento y aviso contextual;
- prohibición de usar información para entrenamiento externo cuando el proveedor permita controlar ese uso;
- registro de prompt, versión, modelo, usuario, propósito, tokens, costo, resultado y revisión;
- retención diferenciada por módulo;
- opción de continuar mediante un flujo humano cuando la IA no esté disponible;
- filtros contra instrucciones incrustadas en documentos;
- separación de fuentes por permisos.

---

# 16. COMUNICACIÓN, CONTENIDOS Y NOTIFICACIONES

## 16.1 CMS

El Superadmin y los roles de comunicación autorizados podrán gestionar:

- páginas;
- noticias;
- comunicados;
- recursos descargables;
- preguntas frecuentes;
- convocatorias;
- eventos;
- banners y alertas;
- perfiles públicos de delegaciones;
- páginas de CIAN, CENI y herramientas;
- SEO, metadatos, imágenes sociales y redirecciones.

Los contenidos tendrán borrador, revisión, programación, publicación, archivo e historial de versiones.

## 16.2 Notificaciones

Canales iniciales:

- centro de notificaciones dentro de la plataforma;
- correo electrónico mediante proveedor desacoplado;
- notificaciones web cuando el usuario las autorice.

La arquitectura quedará preparada para WhatsApp o SMS sin asumirlos como requisito inicial. Cada mensaje partirá de una plantilla versionada y registrará entrega, fallo, reintento y preferencia del usuario. Los avisos obligatorios de gobierno sindical se distinguirán de comunicaciones promocionales.

## 16.3 Eventos y capacitación

- calendario público y privado;
- registro y capacidad;
- elegibilidad;
- pagos cuando correspondan;
- asistencia;
- materiales;
- evaluación;
- constancias verificables;
- eventos por territorio;
- cursos vinculados con CENI, CIAN o beneficios sindicales.

---

# 17. ARQUITECTURA TÉCNICA OBLIGATORIA

## 17.1 Plataforma

- Vercel como plataforma de despliegue.
- Next.js con App Router.
- TypeScript en modo estricto.
- React Server Components por defecto y componentes cliente solo cuando exista interacción real.
- Neon PostgreSQL como única base de datos.
- Prisma como ORM y sistema de migraciones.
- Vercel Blob como almacenamiento de objetos.
- Stripe para pagos.
- Gemini para IA.
- Zod o equivalente para validación compartida.
- Playwright para pruebas de flujo completo.
- Vitest o equivalente para pruebas unitarias y de integración.

Se usarán versiones estables y compatibles al momento de iniciar la Fase 1. Las versiones exactas quedarán bloqueadas en el archivo de dependencias y documentadas.

## 17.2 Capas

1. **Presentación:** rutas públicas, portales y paneles.
2. **Aplicación:** casos de uso y políticas de autorización.
3. **Dominio:** entidades, reglas y transiciones.
4. **Persistencia:** Prisma y Neon.
5. **Archivos:** Vercel Blob mediante servicio centralizado.
6. **Integraciones:** Stripe, Gemini, correo y herramientas.
7. **Auditoría y observabilidad:** eventos, bitácoras y salud.

Las rutas y componentes no accederán directamente a Prisma, Blob, Stripe o Gemini. Utilizarán servicios de aplicación para centralizar permisos, validación y auditoría.

## 17.3 Migraciones desde el repositorio

- Toda modificación de esquema producirá una migración versionada dentro del repositorio.
- Producción ejecutará `prisma migrate deploy` desde el proceso de despliegue.
- Se utilizará conexión directa de Neon para migraciones y conexión apropiada para ejecución serverless.
- Ningún despliegue dependerá de abrir el panel de Neon y ejecutar SQL manual.
- Los scripts de datos deberán ser idempotentes, auditables y versionados.
- El despliegue se detendrá si falla una migración.
- Cada fase probará instalación sobre base vacía y actualización desde la fase anterior.
- No se usará `prisma db push` en producción.
- No se editará una migración ya aplicada; se agregará una migración correctiva explícita.

## 17.4 Archivos en Vercel Blob

Los archivos serán privados por defecto. La base guardará metadatos, propietario, entidad responsable, clasificación, hash, tamaño, tipo, ruta lógica, versión y política de retención. El acceso se hará mediante rutas autenticadas o URL temporal controlada.

No se aceptará:

- almacenar binarios en PostgreSQL;
- exponer permanentemente documentos sensibles;
- confiar solo en una URL difícil de adivinar;
- reutilizar nombres originales como identificadores públicos;
- borrar archivos sin verificar retención, bloqueo legal y referencias.

## 17.5 Trabajos asíncronos

Se utilizará una tabla de trabajos y ejecuciones idempotentes activadas por Vercel Cron para:

- recordatorios;
- renovaciones;
- conciliación de pagos;
- reintento de webhooks;
- expiración de credenciales;
- tareas de retención;
- generación diferida de documentos;
- verificación de integraciones.

Cada trabajo tendrá bloqueo, intentos, próxima ejecución, error, resultado y alerta tras agotar reintentos.

## 17.6 PWA

La aplicación será instalable y tendrá manifiesto, iconos, metadatos, comportamiento móvil y caché segura de recursos públicos. No almacenará expedientes sensibles en cachés persistentes del navegador. Las acciones que requieran conexión lo indicarán claramente.

---

# 18. MODELO DE DATOS CONCEPTUAL

El esquema definitivo se diseñará en la Fase 0. Como mínimo deberá contemplar las siguientes familias de entidades.

## 18.1 Identidad y acceso

- `Person`
- `User`
- `Credential`
- `Session`
- `PasswordReset`
- `Role`
- `Permission`
- `RoleAssignment`
- `TerritorialScope`
- `LegalEntity`
- `Organization`
- `OrganizationUser`

## 18.2 Membresías y padrones

- `MembershipType`
- `MembershipApplication`
- `ApplicationDocument`
- `ApplicationReview`
- `Membership`
- `MembershipStatusEvent`
- `ProtectedBeneficiary`
- `CareRelationship`
- `ProfessionalProfile`
- `DirectoryPreference`
- `DirectoryPublication`
- `MemberCredential`
- `CredentialVerification`

## 18.3 Gobierno y territorio

- `TerritorialUnit`
- `UnionBody`
- `OfficeDefinition`
- `OfficeTerm`
- `PowerGrant`
- `Assembly`
- `AssemblyCall`
- `AgendaItem`
- `AssemblyRosterSnapshot`
- `Attendance`
- `Resolution`
- `VoteProcess`
- `Ballot`
- `VoteEligibility`
- `VoteReceipt`
- `Election`
- `CandidateSlate`
- `ElectionIncident`
- `DisciplinaryCase`
- `DisciplinaryEvidence`
- `DisciplinaryDecision`
- `Appeal`

## 18.4 Casos y atención social

- `SupportRequest`
- `Case`
- `CaseParticipant`
- `CaseAssignment`
- `CaseEvent`
- `CaseTask`
- `CaseMessage`
- `Referral`
- `Consent`
- `ConsentVersion`
- `EmergencyFlag`

## 18.5 Finanzas

- `CatalogProduct`
- `CatalogPrice`
- `BillingAccount`
- `Subscription`
- `InvoiceReference`
- `Payment`
- `Refund`
- `DiscountGrant`
- `Scholarship`
- `LedgerEntry`
- `Reconciliation`
- `AssetRegister`
- `AssetMovement`
- `StripeAccountConfiguration`
- `StripeWebhookEvent`

## 18.6 Archivos y documentos

- `FileObject`
- `FileVersion`
- `DocumentTemplate`
- `GeneratedDocument`
- `SignatureRecord`
- `RetentionPolicy`
- `LegalHold`

## 18.7 Herramientas

- `ToolDefinition`
- `ToolPlan`
- `ToolEntitlement`
- `ToolLaunch`
- `ExternalIdentityLink`
- `IntegrationCredentialReference`
- `IntegrationEvent`

## 18.8 CIAN

- `CianIntake`
- `CianProfessional`
- `CianService`
- `CianAvailability`
- `CianAppointment`
- `CianCareEpisode`
- `CianCarePlan`
- `CianGoal`
- `CianClinicalNote`
- `CianOutcome`
- `CianReferral`

## 18.9 CENI

- `CeniProgram`
- `CeniSite`
- `CeniEngagement`
- `AssessmentTemplate`
- `AssessmentVersion`
- `AssessmentResponse`
- `AssessmentEvidence`
- `Finding`
- `ImprovementPlan`
- `ImprovementAction`
- `TrainingRequirement`
- `CertificationDecision`
- `CeniCertificate`
- `CeniBadge`

## 18.10 IA, contenido y operación

- `AiProviderConfiguration`
- `AiPrompt`
- `AiPromptVersion`
- `AiConversation`
- `AiGeneration`
- `AiReview`
- `KnowledgeSource`
- `ContentPage`
- `ContentVersion`
- `Event`
- `EventRegistration`
- `Notification`
- `NotificationTemplate`
- `DeliveryAttempt`
- `BackgroundJob`
- `WebhookEvent`
- `AuditEvent`
- `SecurityEvent`

## 18.11 Reglas generales del esquema

- Identificadores opacos no secuenciales para exposición pública.
- Fechas almacenadas en UTC y mostradas en la zona del usuario o territorio.
- Dinero almacenado en unidades menores y con moneda explícita.
- Estados mediante enumeraciones o catálogos controlados, no texto libre.
- Borrado lógico cuando exista obligación de conservar historial.
- Versionado para estatutos, consentimientos, prompts, evaluaciones y documentos.
- Integridad referencial obligatoria.
- Índices para búsquedas y filtros reales.
- Unicidad parcial o lógica para evitar membresías activas duplicadas.
- Metadatos mínimos; no usar columnas JSON como sustituto de un modelo relacional.
- Toda entidad crítica tendrá creación, actualización, actor y versión para concurrencia.

---

# 19. API Y CONTRATOS DE APLICACIÓN

## 19.1 Principios

- Las operaciones internas se implementarán mediante servicios de aplicación invocados por Server Actions o Route Handlers.
- Las integraciones externas utilizarán endpoints versionados bajo `/api/v1`.
- Toda entrada se validará en servidor.
- Toda salida respetará permisos de campo, no solo permisos de pantalla.
- Los errores tendrán código estable, mensaje comprensible y correlación.
- Las mutaciones críticas serán idempotentes.
- La paginación será por cursor para colecciones grandes.
- Filtros y ordenamientos estarán permitidos mediante listas explícitas.

## 19.2 Familias de endpoints externos

- `/api/v1/auth/*`
- `/api/v1/public/directory/*`
- `/api/v1/verify/credentials/*`
- `/api/v1/verify/ceni/*`
- `/api/v1/memberships/*`
- `/api/v1/support-requests/*`
- `/api/v1/cases/*`
- `/api/v1/payments/*`
- `/api/v1/tools/*`
- `/api/v1/cian/*`
- `/api/v1/ceni/*`
- `/api/v1/assemblies/*`
- `/api/v1/elections/*`
- `/api/v1/webhooks/stripe/{account}`
- `/api/v1/integrations/{provider}/*`
- `/api/v1/cron/*`

La lista es contractual a nivel de familias, no obliga a crear endpoints innecesarios si una operación es exclusivamente interna. Cada endpoint implementado deberá contar con autorización, validación, documentación y pruebas.

---

# 20. SEGURIDAD, PRIVACIDAD Y AUDITORÍA

## 20.1 Autenticación

- correo y contraseña segura para usuarios ordinarios;
- hash resistente y parámetros documentados;
- activación de cuenta mediante invitación o verificación;
- recuperación segura;
- rotación de sesión tras autenticación;
- cookies `HttpOnly`, `Secure` y política `SameSite` apropiada;
- revocación por cierre de sesión, cambio de contraseña o acción administrativa;
- listado de sesiones propias;
- límites de intentos y protección contra abuso.

## 20.2 Autorización

La autorización se comprobará en servidor en cada lectura, mutación, descarga y generación. Ocultar un botón no constituye seguridad. Las consultas deberán limitar filas y campos antes de devolver resultados.

## 20.3 Datos sensibles

- recopilar solo lo necesario;
- propósito visible;
- consentimiento versionado cuando aplique;
- acceso por expediente;
- descargas controladas;
- cifrado en tránsito y protecciones del proveedor en reposo;
- secretos solo en variables de entorno;
- nunca registrar contraseñas, tokens, diagnósticos completos ni documentos en logs;
- separación de ambientes;
- respaldo y restauración documentados;
- procedimientos para acceso, rectificación, cancelación u oposición conforme al régimen aplicable;
- tratamiento especial de menores y personas representadas.

## 20.4 Auditoría

Se auditarán como mínimo:

- accesos privilegiados;
- consulta y descarga de expedientes sensibles;
- cambios de roles;
- admisiones, rechazos, bajas y sanciones;
- pagos, ajustes y reembolsos;
- publicación de directorio;
- emisión y revocación de credenciales;
- convocatorias, padrones congelados y resultados;
- publicación de prompts;
- decisiones CENI;
- cambios de consentimiento;
- exportaciones;
- acciones del Superadmin.

Los eventos de auditoría serán anexables, no editables desde la interfaz. Contendrán actor, acción, objeto, fecha, resultado, motivo, alcance y correlación, minimizando datos personales.

## 20.5 Amenazas que deberán probarse

- acceso horizontal a registros de otra persona;
- escalamiento vertical de privilegios;
- manipulación de identificadores;
- carga de archivos maliciosos;
- fuga mediante URL de Blob;
- replay de webhooks;
- doble pago o doble activación;
- voto duplicado o correlación entre persona y sentido del voto;
- inyección de prompt desde documentos;
- exportación masiva no autorizada;
- secuestro de sesión;
- enumeración de miembros o beneficiarios;
- abuso de recuperación de contraseña;
- modificación retrospectiva de registros históricos.

---

# 21. VARIABLES DE ENTORNO

El repositorio incluirá `.env.example` sin secretos y `docs/ENVIRONMENT.md` con propósito, obligatoriedad, formato y ambiente de cada variable.

Variables mínimas previstas:

```text
APP_URL=
AUTH_SECRET=
SUPERADMIN_EMAIL=
SUPERADMIN_PASSWORD_HASH=
SUPERADMIN_SESSION_VERSION=

DATABASE_URL=
DIRECT_URL=

BLOB_READ_WRITE_TOKEN=

STRIPE_FUERZA_SECRET_KEY=
STRIPE_FUERZA_WEBHOOK_SECRET=
STRIPE_ALIANZA_SECRET_KEY=
STRIPE_ALIANZA_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_FUERZA_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_ALIANZA_PUBLISHABLE_KEY=

GEMINI_API_KEY=
GEMINI_DEFAULT_MODEL=

EMAIL_PROVIDER=
EMAIL_FROM=
EMAIL_API_KEY=

CRON_SECRET=
QR_SIGNING_SECRET=
FILE_URL_SIGNING_SECRET=
```

Las variables públicas solo contendrán valores seguros para navegador. Ningún secreto llevará prefijo público. La ausencia de una variable obligatoria deberá producir un error de inicio comprensible, sin revelar el valor esperado.

---

# 22. PRUEBAS Y CALIDAD

## 22.1 Pirámide de pruebas

- pruebas unitarias de reglas y transiciones;
- pruebas de integración con base de datos aislada;
- pruebas contractuales de Stripe, Gemini, correo y herramientas mediante adaptadores controlados;
- pruebas de componentes críticos;
- pruebas E2E con Playwright;
- pruebas de autorización negativas;
- pruebas de migración;
- pruebas de accesibilidad automatizadas y revisión manual;
- pruebas visuales de rutas representativas;
- pruebas de rendimiento y concurrencia en flujos críticos.

## 22.2 Flujos E2E mínimos globales

1. Solicitud, revisión, pago, activación y verificación QR de un agremiado.
2. Afiliación honoraria con pago y acceso a beneficios sin derecho de voto.
3. Registro de beneficiario protegido sin afiliación ni cobro.
4. Consentimiento y canalización de Fuerza Índigo a Alianza Índigo.
5. Pago fallido, reintento, conciliación y activación correcta.
6. Directorio privado y publicación voluntaria con retiro posterior.
7. Convocatoria, padrón congelado, quórum, voto secreto y acta.
8. Caso disciplinario con audiencia, resolución y recurso.
9. Acceso a una herramienta por beneficio y revocación al vencer.
10. CIAN desde admisión hasta plan y seguimiento.
11. CENI desde contratación hasta certificado QR y renovación.
12. Consulta Gemini con permisos y revisión humana.
13. Revocación de un rol territorial sin pérdida del historial.
14. Acceso denegado a un expediente ajeno aunque se conozca su identificador.
15. Despliegue desde base vacía mediante migraciones del repositorio.

## 22.3 Comandos de calidad

El repositorio deberá proporcionar comandos equivalentes a:

```text
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run build
npm run db:migrate
npm run db:seed
npm run phase:verify
```

`phase:verify` ejecutará los controles aplicables a la fase activa y generará un resultado legible por humanos y agentes.

---

# 23. PROTOCOLO DE EJECUCIÓN POR FASES

## 23.1 Estado de fase

`docs/PHASE_STATUS.md` deberá contener:

- fase activa;
- alcance contratado;
- criterios de aceptación;
- tareas completadas;
- evidencias;
- pruebas y resultados;
- defectos abiertos;
- decisiones;
- estado `IN_PROGRESS`, `BLOCKED` o `APPROVED`;
- SHA del punto de control cuando exista.

El agente no marcará una fase como aprobada basándose únicamente en que la aplicación compila.

## 23.2 Puerta universal de salida

Una fase solo podrá cerrarse si:

- todo su alcance está implementado;
- no existen errores críticos, altos o medios conocidos dentro de la fase;
- no existen botones, rutas o acciones incompletas;
- migraciones funcionan desde cero y desde la fase anterior;
- permisos positivos y negativos están probados;
- UI móvil y escritorio fue revisada;
- accesibilidad fue validada;
- estados vacíos y de error están terminados;
- auditoría está conectada;
- documentación refleja el código real;
- lint, tipos, pruebas y build concluyen correctamente;
- no hay secretos ni datos reales en el repositorio;
- existe informe de cierre.

Si falla un solo punto, la fase será `BLOCKED` o permanecerá `IN_PROGRESS`.

## 23.3 Informe de cierre

El informe deberá terminar exactamente con una de estas declaraciones:

```text
FASE APROBADA — 100% COMPLETA
```

o

```text
FASE BLOQUEADA — NO AUTORIZADA PARA AVANZAR
```

Después del informe, el agente se detendrá. No comenzará la fase siguiente dentro de la misma ejecución.

---

# 24. FASES DE CONSTRUCCIÓN

## FASE 0 — Arquitectura integral y preparación del repositorio

### Objetivo

Eliminar decisiones tardías mediante una arquitectura completa antes de construir módulos.

### Alcance

- inspección del repositorio;
- inventario de código reutilizable y deuda;
- mapa de módulos y dependencias;
- modelo de dominios;
- diagrama completo de datos;
- matriz de roles, atributos y permisos;
- contratos de servicios e integraciones;
- arquitectura de rutas;
- estrategia de archivos;
- estrategia de auditoría;
- estrategia de Stripe por entidad;
- estrategia de IA y privacidad;
- mapa de consentimientos;
- catálogo inicial de estados y transiciones;
- plan de migraciones;
- plan de pruebas;
- ADR y documentación base;
- configuración de seguimiento de fases.

### Entregables

- `docs/ARCHITECTURE.md`;
- `docs/DATA_MODEL.md`;
- `docs/PERMISSIONS.md`;
- `docs/FLOWS.md`;
- `docs/INTEGRATIONS.md`;
- `docs/SECURITY.md`;
- `docs/TEST_PLAN.md`;
- `docs/PHASE_STATUS.md`;
- diagramas Mermaid mantenibles;
- backlog asignado a fases, sin tareas huérfanas.

### Criterios específicos

- Todas las entidades de las secciones 18.1 a 18.10 están modeladas o justificadamente consolidadas.
- Cada módulo conoce sus dependencias y no obliga a rediseñar identidad, permisos, pagos o archivos después.
- Las diferencias entre agremiado, afiliado honorario y beneficiario protegido están reflejadas en datos y permisos.
- La separación Fuerza Índigo/Alianza Índigo está resuelta antes de crear cobros o expedientes.
- No se implementan funciones de fases posteriores salvo infraestructura mínima para validar la arquitectura.

## FASE 1 — Infraestructura, datos, autenticación, permisos y Superadmin

### Objetivo

Construir la base productiva y segura sobre la que descansarán todos los módulos.

### Alcance

- Next.js, TypeScript estricto y estructura modular;
- configuración de Vercel;
- Prisma y Neon;
- migración inicial completa de entidades base;
- conexión y salud de base de datos;
- autenticación ordinaria;
- acceso Superadmin por variables de entorno;
- sesiones, recuperación e invitaciones;
- roles, permisos y alcances;
- servicio de auditoría;
- servicio privado de Vercel Blob;
- validación central de variables;
- manejo uniforme de errores;
- trabajos programados base;
- pruebas y datos semilla no sensibles;
- CI de calidad.

### Pantallas

- inicio y cierre de sesión;
- activación y recuperación;
- sesiones propias;
- login de Superadmin;
- tablero técnico de Superadmin;
- gestión base de entidades jurídicas, personas administradoras y roles;
- visor de auditoría con permisos.

### Criterios específicos

- Un Superadmin puede iniciar sesión sin existir como miembro.
- Un administrador ordinario no puede asignarse permisos superiores.
- El aislamiento por entidad y territorio funciona en consultas y mutaciones.
- Un archivo privado no puede abrirse mediante su URL persistente sin autorización.
- Las migraciones corren desde el repositorio sobre Neon vacío.
- No existe ninguna dependencia de Supabase.

## FASE 2 — Sistema de diseño, PWA, CMS y sitio público

### Objetivo

Crear una experiencia pública moderna y el lenguaje visual reutilizable de toda la plataforma.

### Alcance

- tokens y componentes;
- temas claro y oscuro;
- preferencias neuroinclusivas;
- navegación pública;
- CMS versionado;
- páginas públicas del mapa funcional;
- formularios de contacto y entrada inicial;
- buscador público;
- SEO técnico;
- metadatos sociales;
- PWA;
- centro de accesibilidad;
- páginas legales configurables;
- analítica respetuosa de privacidad para eventos esenciales.

### Criterios específicos

- Ninguna página usa contenido ficticio para aparentar terminación.
- La identidad diferencia módulos sin fragmentar el ecosistema.
- Todas las rutas principales tienen diseño móvil y escritorio verificado.
- CMS maneja borrador, revisión, publicación y reversión.
- La PWA no almacena expedientes sensibles.
- Rendimiento y accesibilidad alcanzan los umbrales definidos en `docs/TEST_PLAN.md`.

## FASE 3 — Catálogo financiero, Stripe y libro auxiliar

### Objetivo

Resolver pagos y derechos económicos antes de conectar activaciones de membresías y servicios.

### Alcance

- catálogo de productos y precios;
- entidades receptoras;
- dos configuraciones Stripe;
- Checkout;
- portal de cliente;
- pagos únicos y suscripciones;
- cupones, becas, exenciones y convenios;
- webhooks idempotentes;
- pagos manuales con evidencia;
- reembolsos;
- conciliación;
- libro auxiliar;
- registro patrimonial y movimientos de activos;
- reportes y exportaciones autorizadas;
- alertas de fallos;
- plantillas de comprobante.

### Criterios específicos

- Ningún acceso se activa por la página de retorno de Stripe.
- Repetir un webhook no duplica movimientos.
- Fuerza Índigo y Alianza Índigo pueden conciliarse por separado.
- Los importes usan moneda y unidades menores.
- Los ajustes requieren motivo, actor y auditoría.
- Los escenarios de pago exitoso, fallido, pendiente, reembolsado y disputado están probados.

## FASE 4 — Afiliación, padrones, directorios y credenciales

### Objetivo

Completar el ciclo de relación de las personas con Fuerza Índigo.

### Alcance

- registro maestro de persona;
- solicitud de agremiado;
- afiliación honoraria activa;
- alta de beneficiario protegido;
- relaciones familiares y de cuidado;
- revisión y resolución;
- documentación;
- pagos y activación;
- membresías y vigencias;
- bajas, suspensiones y conversiones;
- padrón sindical;
- padrón honorario;
- padrón protegido;
- directorio interno;
- directorio público opt-in;
- preferencias de indexación;
- credenciales y QR;
- preparación de altas y bajas para obligaciones laborales;
- panel personal moderno.

### Criterios específicos

- Una misma persona puede tener varias relaciones sin duplicarse.
- Un beneficiario recibe atención sin afiliación ni pago.
- Un afiliado honorario nunca obtiene voto por error.
- Solo agremiados elegibles aparecen en el padrón sindical correspondiente.
- Retirar consentimiento elimina la publicación pública y la indexación controlada.
- Una credencial revocada se refleja inmediatamente en el verificador.
- Todos los estados y transiciones están auditados.

## FASE 5 — Estructura territorial, gobierno, asambleas y elecciones

### Objetivo

Digitalizar la vida institucional sin reducir garantías democráticas.

### Alcance

- unidades territoriales;
- secciones, delegaciones y representaciones;
- órganos y cargos;
- periodos, suplencias y poderes;
- convocatorias;
- asambleas;
- padrón congelado;
- asistencia y quórum;
- orden del día, resoluciones y actas;
- seguimiento de acuerdos;
- Comisión Electoral;
- planillas, candidaturas y elecciones;
- voto secreto;
- control de proporcionalidad de género;
- Comisión de Vigilancia;
- contratos colectivos, revisión contractual y consultas de agremiados afectados;
- expedientes de conflictos colectivos y huelga;
- régimen disciplinario;
- archivo histórico;
- reportes para autoridad competente.

### Criterios específicos

- La plataforma distingue primera y segunda convocatoria.
- El cálculo de quórum es reproducible desde el padrón congelado.
- El voto emitido no puede asociarse con su sentido desde la interfaz o base operativa ordinaria.
- Afiliados honorarios y beneficiarios no votan.
- Cargos vencidos pierden acceso automáticamente.
- Sanciones respetan audiencia, pruebas, resolución y recurso.
- Las consultas de contratos colectivos usan un padrón específico y conservan evidencia verificable.
- Los expedientes de huelga exigen acuerdo humano y no pueden iniciarse por una automatización.

## FASE 6 — Defensa, casos, protección y canalización social

### Objetivo

Proporcionar una puerta única de ayuda y un expediente seguro para la intervención sindical o social.

### Alcance

- solicitud guiada de apoyo;
- clasificación informativa;
- prioridades y alertas;
- expediente de caso;
- participantes y representación;
- asignación por territorio y competencia;
- tareas y plazos;
- comunicaciones;
- documentos;
- derivaciones;
- consentimiento entre entidades;
- panel de Trabajo y Conflictos;
- panel de Neuroinclusión y Enlace Familiar;
- panel social de Alianza Índigo;
- cierre y reapertura;
- indicadores anonimizados.

### Criterios específicos

- El usuario puede pedir apoyo sin saber qué área corresponde.
- La propuesta automática de canalización no sustituye confirmación humana.
- No se comparten notas entre sindicato y A.C. sin consentimiento y necesidad.
- Toda lectura sensible queda auditada.
- El sistema prueba acceso denegado para territorios y expedientes ajenos.
- Casos urgentes muestran rutas humanas y de emergencia configuradas.

## FASE 7 — Herramientas tecnológicas

### Objetivo

Convertir ADIA, NEXO, NeuroPlan y futuras herramientas en una oferta unificada y administrable.

### Alcance

- catálogo;
- planes y elegibilidad;
- derechos de acceso;
- lanzamiento seguro;
- enlaces de identidad externa;
- consentimiento de intercambio;
- historial de acceso;
- panel de herramientas;
- administración de integraciones;
- métricas agregadas;
- suspensión y revocación;
- documentación para agregar nuevas herramientas.

### Criterios específicos

- Cada herramienta puede integrarse sin cambiar el núcleo de membresías.
- Los enlaces firmados expiran y no exponen datos en URL.
- El usuario entiende el origen y vigencia de su acceso.
- La falla de una herramienta no bloquea el portal central.
- No se comparten diagnósticos para recomendar herramientas.

## FASE 8 — CIAN

### Objetivo

Completar la operación de atención integral de Alianza Índigo.

### Alcance

- admisión;
- entrevista y consentimientos;
- triage humano;
- profesionales y servicios;
- disponibilidad y citas;
- episodios y expedientes;
- planes, objetivos y seguimientos;
- notas restringidas;
- canalizaciones diagnósticas o terapéuticas;
- coordinación familiar;
- pagos y becas;
- integración con NeuroPlan;
- calidad y resultados;
- panel profesional y coordinación.

### Criterios específicos

- Un profesional solo ve casos asignados.
- Familiares acceden exclusivamente a lo autorizado.
- Personal sindical no ve notas clínicas por defecto.
- La IA no diagnostica.
- Citas, cancelaciones, lista de espera, ausencias y reprogramaciones están completas.
- Planes y notas conservan autoría, fecha y versiones necesarias.

## FASE 9 — CENI

### Objetivo

Construir el ciclo comercial, técnico y verificable de inclusión institucional.

### Alcance

- CRM básico de organizaciones CENI;
- usuarios y sedes;
- programas y contratos;
- pago;
- evaluaciones versionadas;
- evidencias;
- hallazgos;
- planes de mejora;
- capacitación;
- seguimiento;
- decisión de certificación;
- certificado y distintivo QR;
- vigencia, suspensión, revocación y renovación;
- directorio público CENI;
- oportunidades y convenios con Fuerza Índigo;
- panel de organización, evaluador y coordinación.

### Criterios específicos

- Una organización nunca accede a otra.
- Cerrar una evaluación preserva su versión y evidencia.
- Gemini no emite la certificación.
- El verificador público distingue vigencia, suspensión, vencimiento y revocación.
- La contratación se concilia con la entidad receptora correcta.
- Datos individuales no se usan en reportes CENI sin autorización y anonimización.

## FASE 10 — Inteligencia artificial Gemini

### Objetivo

Incorporar IA gobernada, medible y segura en los módulos ya funcionales.

### Alcance

- servicio central Gemini;
- prompts y versiones;
- laboratorio de pruebas;
- publicación y reversión;
- base documental por permisos;
- orientación;
- clasificación sugerida;
- resúmenes;
- documentos asistidos;
- apoyo CIAN no diagnóstico;
- apoyo CENI no decisorio;
- integraciones con NEXO, ADIA y NeuroPlan cuando corresponda;
- costos, límites y auditoría;
- revisión humana;
- degradación cuando el proveedor no responda;
- defensas ante inyección de prompt y exfiltración.

### Criterios específicos

- Ningún prompt crítico vive solamente en código.
- Fuentes y fragmentos respetan permisos del usuario.
- La salida identifica que fue generada con IA y permite corregirla.
- Las acciones sensibles requieren confirmación humana.
- La aplicación continúa operando si Gemini está caído.
- Los costos y errores pueden consultarse por módulo sin exponer contenido sensible.

## FASE 11 — Comunicaciones, eventos, capacitación e indicadores

### Objetivo

Cerrar la operación comunitaria y proporcionar medición útil a cada nivel.

### Alcance

- centro de notificaciones;
- correo;
- notificaciones web;
- preferencias;
- plantillas;
- campañas operativas autorizadas;
- eventos;
- registros y asistencia;
- constancias;
- capacitación;
- tableros por rol;
- indicadores territoriales;
- reportes institucionales;
- exportaciones;
- transparencia publicada;
- alertas de vencimientos y obligaciones.

### Criterios específicos

- Comunicaciones obligatorias y promocionales se gestionan separadamente.
- Las plantillas están versionadas.
- Los indicadores sensibles usan agregación y umbrales de privacidad.
- Las exportaciones respetan permisos y quedan auditadas.
- Las constancias son verificables y revocables.
- Los paneles muestran decisiones accionables, no métricas decorativas.

## FASE 12 — Endurecimiento, migración final y liberación productiva

### Objetivo

Demostrar que el sistema completo puede operar en producción sin pendientes funcionales.

### Alcance

- prueba integral de los 15 flujos E2E globales;
- revisión de seguridad;
- revisión de permisos;
- revisión visual completa;
- accesibilidad manual y automatizada;
- rendimiento y carga;
- recuperación ante fallos;
- restauración de base y archivos;
- conciliación Stripe;
- revisión de costos y límites;
- SEO y PWA;
- revisión de logs y alertas;
- migración de datos existentes cuando los haya;
- manuales operativos;
- capacitación administrativa;
- checklist de Vercel;
- despliegue de producción y verificación posterior.

### Criterios específicos

- Cero defectos críticos, altos o medios abiertos.
- Cero funciones simuladas o incompletas.
- Migración reproducible desde repositorio.
- Recuperación verificada mediante ejercicio real en ambiente controlado.
- Separación de entidades validada.
- Credenciales y certificados QR verificados.
- Webhooks y trabajos programados observables.
- Documentación suficiente para que otro agente mantenga el producto.
- Aprobación final documentada por módulo.

---

# 25. CRITERIOS DE ACEPTACIÓN TRANSVERSALES

Una historia o función no está terminada hasta que:

1. El flujo normal funciona.
2. Los flujos alternos y errores están resueltos.
3. Existe validación del lado servidor.
4. Los permisos se prueban positivamente y negativamente.
5. La acción crítica deja auditoría.
6. La interfaz es moderna, responsive y consistente.
7. Tiene estados de carga, vacío, error y éxito.
8. Es utilizable con teclado y tecnologías de asistencia.
9. No filtra datos en logs, URLs o respuestas.
10. Incluye pruebas automatizadas proporcionales al riesgo.
11. La documentación refleja su funcionamiento real.
12. Se verificó en despliegue de vista previa.

---

# 26. FUERA DE ALCANCE INICIAL

Quedan fuera únicamente mientras no sean solicitados mediante una ampliación formal:

- nómina interna;
- contabilidad fiscal completa que sustituya un sistema contable autorizado;
- expediente clínico hospitalario;
- diagnóstico automatizado;
- red social pública sin moderación;
- intercambio abierto de datos con terceros;
- criptomonedas;
- aplicaciones móviles nativas separadas;
- infraestructura fuera de Vercel, Neon y Vercel Blob;
- proveedores de IA distintos de Gemini;
- Supabase en cualquiera de sus servicios.

"Fuera de alcance" no autoriza dejar inconclusa una dependencia requerida por los módulos incluidos.

---

# 27. DEFINICIÓN FINAL DE TERMINADO

La Plataforma Integral Fuerza Índigo estará terminada cuando:

- cualquier persona pueda comprender las formas de vinculación;
- un agremiado complete su ciclo desde solicitud hasta credencial y participación;
- una persona obtenga afiliación honoraria sin recibir derechos electorales indebidos;
- un beneficiario protegido reciba apoyo sin necesidad de pagar o afiliarse;
- el sindicato opere padrones, territorio, órganos, asambleas, elecciones, cuotas y defensa;
- Alianza Índigo gestione la atención social con separación jurídica y de datos;
- CIAN opere la ruta integral de atención;
- CENI opere desde contratación hasta certificación verificable;
- ADIA, NEXO y NeuroPlan se encuentren integrados mediante una capa extensible;
- Stripe determine pagos y suscripciones mediante webhooks confiables;
- Gemini apoye sin tomar decisiones reservadas a personas;
- los archivos permanezcan protegidos en Vercel Blob;
- Neon y todas las migraciones se administren desde el repositorio;
- Superadmin funcione mediante variables de entorno;
- todas las interfaces alcancen el estándar moderno y neuroinclusivo definido;
- la aplicación completa pueda desplegarse en Vercel desde cero;
- no exista rastro técnico de Supabase;
- no queden parches pendientes, funciones simuladas ni deuda conocida de las fases aprobadas.

La aprobación de la Fase 12 significará que Fuerza Índigo no es un prototipo: es una plataforma productiva que convierte al sindicato en el corazón operativo del ecosistema Alianza Índigo.

---

# FIN DEL PRD IA MAESTRO
