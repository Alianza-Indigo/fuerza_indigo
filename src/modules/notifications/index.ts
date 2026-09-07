/** Interfaz pública del módulo de notificaciones. */
export {
  myNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  type NotificationRow,
  type NotificationCenter,
} from './application/center';
export {
  myNotificationPreferences,
  setNotificationPreferences,
  setNotificationPreferencesSchema,
  type CategoryPreferenceView,
  type SetNotificationPreferencesInput,
} from './application/preferences';
export {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  isMandatoryCategory,
} from './domain/preferences';
export {
  draftNotificationTemplate,
  draftNotificationTemplateSchema,
  publishNotificationTemplate,
  publishNotificationTemplateSchema,
  retireNotificationTemplate,
  retireNotificationTemplateSchema,
  notificationTemplateDetail,
  notificationTemplateList,
  type DraftNotificationTemplateInput,
  type NotificationTemplateRow,
} from './application/templates';
