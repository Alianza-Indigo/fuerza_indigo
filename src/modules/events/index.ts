/** Interfaz pública del módulo de eventos. */
export {
  createEvent,
  createEventSchema,
  publishEvent,
  openEventRegistration,
  cancelEvent,
  eventList,
  eventDetailForStaff,
  type CreateEventInput,
  type EventRow,
  type EventDetailForStaff,
} from './application/manage';
export {
  registerForEvent,
  cancelOwnRegistration,
  myEventRegistrations,
  eventRegistrations,
  type MyRegistrationRow,
  type RegistrationRow,
} from './application/registration';
export {
  publicEventCalendar,
  memberEventCalendar,
  eventDetailBySlug,
  type CalendarRow,
  type MemberCalendarRow,
  type EventDetailView,
} from './application/calendar';
