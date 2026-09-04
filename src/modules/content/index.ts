/** Interfaz pública del módulo de contenidos. */
export {
  createPage,
  editPage,
  createPageSchema,
  editPageSchema,
  type CreatePageInput,
} from './application/authoring';
export {
  submitForReview,
  reviewPage,
  publishPage,
  archivePage,
  revertPage,
  reviewSchema,
  publishSchema,
  revertSchema,
} from './application/publishing';
export {
  publishedPage,
  publishedList,
  editorialPages,
  versionHistory,
  type PublishedPage,
  type PublishedSummary,
  type EditorialPage,
  type VersionHistoryEntry,
} from './application/queries';
export { publishDueContent } from './application/scheduled';
