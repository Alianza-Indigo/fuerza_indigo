/** Interfaz pública del módulo de entrada pública. */
export {
  submitRequest,
  submitRequestSchema,
  REQUEST_TYPES,
  INTAKE_RATE_LIMIT,
  PUBLIC_INTAKE_NOTICE_CODE,
  type SubmitRequestInput,
  type IntakeContext,
} from './application/intake';
export {
  requestList,
  requestDetail,
  resolveRequest,
  resolveRequestSchema,
  type RequestRow,
  type RequestDetail,
  type ResolveRequestInput,
} from './application/inbox';
