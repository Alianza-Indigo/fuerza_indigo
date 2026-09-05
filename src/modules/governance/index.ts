/** Interfaz pública del módulo de vida institucional (PRD §9). */
export {
  createTerritorialUnit,
  updateTerritorialUnit,
  dissolveTerritorialUnit,
  territorialTree,
  territorialPanel,
  enablingResolutionOptions,
  segmentoDeRuta,
  createTerritorialUnitSchema,
  updateTerritorialUnitSchema,
  dissolveTerritorialUnitSchema,
  type CreateTerritorialUnitInput,
  type UpdateTerritorialUnitInput,
  type DissolveTerritorialUnitInput,
  type TerritorialNode,
  type TerritorialPanelData,
  type EnablingResolutionOption,
} from './application/territory';

export {
  createUnionBody,
  defineOffice,
  declareIncompatibility,
  incompatibleOffices,
  unionBodyList,
  officeList,
  reglasVigentes,
} from './application/bodies';

export {
  appointOffice,
  endOfficeTerm,
  revokeExpiredOfficeAccess,
  officeTermList,
  type OfficeTermRow,
} from './application/office-terms';
