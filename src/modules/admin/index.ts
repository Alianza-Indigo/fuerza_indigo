/** Interfaz pública del módulo de administración técnica. */
export { systemOverview, type SystemOverview } from './application/overview';
export { listAdministrablePeople, type AdminPersonView } from './application/people';
export { startupStatus, type StartupStatus } from './application/startup';
export {
  listLegalEntities,
  updateLegalEntity,
  updateLegalEntitySchema,
  type LegalEntityView,
  type UpdateLegalEntityInput,
} from './application/legal-entities';
