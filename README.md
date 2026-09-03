# Plataforma Integral Fuerza Índigo

Sistema operativo digital del **Sindicato Unión de Inclusión y Derechos Neurodivergentes "Fuerza Índigo"** y del ecosistema **Alianza Índigo**: afiliación, padrones, vida democrática, defensa y protección, atención social (CIAN), inclusión institucional (CENI), herramientas tecnológicas (ADIA, NEXO, NeuroPlan), pagos e inteligencia artificial gobernada.

- **Dominio principal previsto:** `fuerzaindigo.lat`
- **Especificación maestra:** [`docs/PRD.md`](docs/PRD.md) — PRD IA MAESTRO v1.0
- **Estado de construcción:** [`docs/PHASE_STATUS.md`](docs/PHASE_STATUS.md)

---

## 1. Fórmula institucional

> Fuerza Índigo representa y defiende. Alianza Índigo atiende y acompaña. CENI genera sostenibilidad y transforma organizaciones. CIAN presta atención integral. La tecnología conecta y escala el ecosistema.

Estas cuatro entidades comparten una experiencia de usuario integrada y mantienen **separación obligatoria** de entidad jurídica, cuentas de cobro, expedientes, permisos y auditoría (PRD §2.3).

---

## 2. Pila tecnológica obligatoria

| Capa | Tecnología |
|---|---|
| Despliegue | Vercel |
| Aplicación | Next.js (App Router), React Server Components |
| Lenguaje | TypeScript en modo estricto |
| Base de datos | Neon PostgreSQL (única base de datos) |
| ORM y migraciones | Prisma |
| Archivos | Vercel Blob (privado por omisión) |
| Pagos | Stripe (una cuenta por entidad jurídica) |
| Inteligencia artificial | Gemini, solo en servidor |
| Validación | Zod, compartida cliente/servidor |
| Pruebas | Vitest (unidad e integración), Playwright (E2E y accesibilidad) |

Las versiones exactas se fijan y documentan al iniciar la Fase 1 (PRD §17.1). Las decisiones técnicas tomadas por el agente constructor están registradas en [`docs/DECISIONS.md`](docs/DECISIONS.md).

> **Prohibición absoluta:** el proveedor vetado en el PRD §0.2 no se utiliza en base de datos, autenticación, almacenamiento, funciones, tiempo real, SDK, paquetes, variables de entorno ni documentación. El control automatizado `C-REPO-03` de `npm run phase:verify` lo comprueba en cada ejecución.

---

## 3. Documentación

| Documento | Contenido |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Especificación maestra íntegra. Fuente de verdad del alcance. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Capas, módulos, rutas, archivos, auditoría, trabajos asíncronos, migraciones. |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Las 130 entidades del PRD §18, enumeraciones, máquinas de estado y diagramas. |
| [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) | Roles, atributos, matriz de permisos, alcances y mapa de consentimientos. |
| [`docs/FLOWS.md`](docs/FLOWS.md) | Flujos funcionales completos con estados alternos y de error. |
| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) | Contratos de Stripe, Gemini, correo, Blob, herramientas, cron y webhooks. |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Autenticación, autorización, datos sensibles, auditoría y amenazas probadas. |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Pirámide de pruebas, 15 flujos E2E globales y umbrales de calidad. |
| [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) | Catálogo de variables de entorno por ambiente. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Registro de decisiones de arquitectura (ADR). |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Backlog completo asignado a fases, sin tareas huérfanas. |
| [`docs/PHASE_STATUS.md`](docs/PHASE_STATUS.md) | Fase activa, criterios, evidencias, defectos y estado. |

---

## 4. Protocolo de construcción por fases

El producto se construye en 13 fases (0 a 12). **Solo se construye la fase activa**, se termina al 100 % y se cierra con un informe antes de solicitar autorización para continuar (PRD §23).

```
Fase 0  Arquitectura integral y preparación del repositorio
Fase 1  Infraestructura, datos, autenticación, permisos y Superadmin
Fase 2  Sistema de diseño, PWA, CMS y sitio público
Fase 3  Catálogo financiero, Stripe y libro auxiliar
Fase 4  Afiliación, padrones, directorios y credenciales
Fase 5  Estructura territorial, gobierno, asambleas y elecciones
Fase 6  Defensa, casos, protección y canalización social
Fase 7  Herramientas tecnológicas
Fase 8  CIAN
Fase 9  CENI
Fase 10 Inteligencia artificial Gemini
Fase 11 Comunicaciones, eventos, capacitación e indicadores
Fase 12 Endurecimiento, migración final y liberación productiva
```

Una fase solo puede cerrarse si supera íntegramente la **puerta universal de salida** del PRD §23.2.

### Verificación de fase

```bash
npm run phase:status   # Muestra la fase activa declarada
npm run phase:verify   # Ejecuta los controles de la fase activa
```

`phase:verify` no requiere dependencias instaladas. Escribe un resultado legible en la terminal y un informe para agentes en `reports/phase-verify.json`. Devuelve código de salida distinto de cero cuando algún control falla.

---

## 5. Puesta en marcha local

> La aplicación Next.js, la base de datos y los comandos de calidad se incorporan en la **Fase 1**. Durante la Fase 0 el repositorio contiene arquitectura, documentación y utilidades de verificación.

```bash
git clone https://github.com/Alianza-Indigo/fuerza_indigo.git
cd fuerza_indigo
node --version        # 22 o superior (ver .nvmrc)
cp .env.example .env.local
npm run phase:verify
```

Los comandos de calidad contratados por el PRD §22.3 (`lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `test:a11y`, `build`, `db:migrate`, `db:seed`) se habilitan en las fases que los introducen, según el calendario de [`docs/BACKLOG.md`](docs/BACKLOG.md). Este repositorio no declara comandos que no funcionen.

---

## 6. Reglas para agentes de desarrollo

1. Leer íntegramente [`docs/PRD.md`](docs/PRD.md) antes de modificar el repositorio.
2. Construir exclusivamente la fase activa declarada en [`docs/PHASE_STATUS.md`](docs/PHASE_STATUS.md).
3. No reducir el alcance a un producto mínimo viable: cada módulo habilitado debe ser utilizable en producción.
4. No dejar botones sin acción, pantallas provisionales, datos simulados ni funciones incompletas de la fase activa.
5. Registrar toda decisión técnica en [`docs/DECISIONS.md`](docs/DECISIONS.md) en lugar de trasladarla al usuario.
6. Mantener la documentación sincronizada con el código real.
7. Ejecutar `npm run phase:verify` antes de proponer el cierre de una fase.
8. Detenerse al concluir la fase, emitir el informe y esperar autorización expresa.

---

## 7. Privacidad y datos

La plataforma trata datos personales sensibles de personas neurodivergentes, menores de edad y personas representadas. Nunca se incorporan datos reales al repositorio, a los datos semilla, a los registros de aplicación ni a los informes automáticos. Los controles aplicables están descritos en [`docs/SECURITY.md`](docs/SECURITY.md).
