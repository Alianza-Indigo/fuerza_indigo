/** Interfaz pública del módulo de documentos institucionales (PRD §16.2). */
export {
  draftTemplate,
  publishTemplate,
  retireTemplate,
  templateList,
  publishedTemplateOptions,
  draftTemplateSchema,
  retireTemplateSchema,
  type DraftTemplateInput,
  type TemplateRow,
  type TemplateOption,
} from './application/templates';

export {
  issueDocument,
  documentsForSubject,
  issueDocumentSchema,
  type IssueDocumentInput,
  type IssuedDocument,
  type DocumentRow,
} from './application/issuance';

export {
  signDocument,
  documentSignatures,
  signDocumentSchema,
  type SignDocumentInput,
  type SignatureRow,
} from './application/signatures';
