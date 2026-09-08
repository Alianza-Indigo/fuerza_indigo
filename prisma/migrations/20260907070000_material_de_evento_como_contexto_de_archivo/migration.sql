-- El material de un evento es un archivo, y su archivo necesita un contexto
-- propio: el material reservado se sirve solo a quien está inscrito, y esa
-- decisión la toma la política de descarga mirando el contexto del archivo. Sin
-- un valor de contexto para eventos, el material tendría que colgar de un
-- contexto ajeno (CONTENT o GOVERNANCE) y la puerta de descarga no sabría que
-- debe consultar la inscripción.
ALTER TYPE "FileContextKind" ADD VALUE IF NOT EXISTS 'EVENT';
