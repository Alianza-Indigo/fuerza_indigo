-- Una constancia de participación es un documento generado como cualquier otro
-- (PRD §16.3, §24 Fase 9 criterio 5). Para que `GeneratedDocument.subjectKind`
-- pueda decir «esto certifica una inscripción a un evento», el catálogo de
-- sujetos de documento gana un valor. No es una tabla nueva: es un valor de
-- enumeración, y la migración solo lo agrega, no lo usa, así que corre igual
-- sobre una base al día y sobre una instalación desde cero.
ALTER TYPE "DocumentSubject" ADD VALUE IF NOT EXISTS 'EVENT_REGISTRATION';
