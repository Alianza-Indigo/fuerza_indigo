/** Interfaz pública del módulo de eventos. */
export {
  createEvent,
  createEventSchema,
  publishEvent,
  openEventRegistration,
  cancelEvent,
  eventList,
  eventDetailForStaff,
  constancyTemplateOptions,
  type CreateEventInput,
  type EventRow,
  type EventDetailForStaff,
  type ConstancyTemplateOption,
} from './application/manage';
export {
  registerForEvent,
  cancelOwnRegistration,
  myEventRegistrations,
  type MyRegistrationRow,
} from './application/registration';
export {
  startEventCheckout,
  confirmEventRegistrationFromPayment,
} from './application/payment';
export {
  publicEventCalendar,
  memberEventCalendar,
  eventDetailBySlug,
  type CalendarRow,
  type MemberCalendarRow,
  type EventDetailView,
} from './application/calendar';
export {
  registerAttendance,
  registerAttendanceSchema,
  issueConstancy,
  revokeConstancy,
  verifyConstancy,
  eventRoster,
  type RegisterAttendanceInput,
  type ConstancyVerification,
  type RosterRow,
} from './application/attendance';
export {
  addEventMaterial,
  addEventMaterialSchema,
  listEventMaterials,
  eventMaterialsForViewer,
  type AddEventMaterialInput,
  type MaterialRow,
} from './application/materials';
